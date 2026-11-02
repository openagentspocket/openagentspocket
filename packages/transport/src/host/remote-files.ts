import {
  type ChatHostFiles,
  failWith,
  type HostFileKind,
  type HostFileListing,
  type HostFileListingRequest,
  type HostFileRange,
  type HostFileSlice,
  type HostFileStatus,
  isAbsoluteHostPath,
  isAcceptablePath,
  isQuotableAbsolutePath,
  type TransportError,
  TransportFailure,
} from '@openagentspocket/core';
import { type Sftp, type SftpKind, SshError } from 'agentico-ssh';
import type { ChannelLease } from '../admission';
import { withDeadline } from '../deadline';
import type { SshTransport } from '../transport';
import { hostHomeDirectory, requirePosixHost } from './environment';

/** The channel is returned once nobody has read through it for this long. */
export const SESSION_FILE_IDLE_MS = 30_000;
function sftpStatusOf(error: Error): number | null {
  const match = /status (\d+)/i.exec(error.message);
  return match ? Number(match[1]) : null;
}

/** OpenSSH's SSH_FX_FAILURE, when a failure names no status. */
const GENERIC_SFTP_STATUS = 4;
const SFTP_NEEDED = 'Chat needs SFTP on the Host';

const KIND_TO_SFTP: Record<HostFileKind, SftpKind> = {
  regular: 'file',
  directory: 'directory',
  symlink: 'symlink',
};

function hostFileKind(kind: SftpKind | null): HostFileKind | null {
  switch (kind) {
    case 'file':
      return 'regular';
    case 'directory':
    case 'symlink':
      return kind;
    default:
      return null;
  }
}

interface Mapped {
  readonly error: Error;
  /** Whether the shared channel should go. */
  readonly retiresChannel: boolean;
}

/**
 * Chat's file operations over one SFTP channel kept for exactly that. A screen that looks every
 * few seconds would otherwise open and close a subsystem channel on every tick. The admission
 * lease is held as long as the channel is (ADR 0011), so the Host's `MaxSessions` cannot be spent
 * while admission looked free. A failure that says the channel is unusable drops both, but only
 * when no other read is using it; a file-level status or a cancel says nothing about the channel.
 * Chat's failures stay its own: its deadline maps to `hostFileTimedOut`, a refused file to
 * `hostFileUnreadable`.
 */
export class SessionHostFiles implements ChatHostFiles {
  private client: Sftp | undefined;
  private lease: ChannelLease | undefined;
  private opening: Promise<Sftp> | undefined;
  private readsInFlight = 0;
  private idleTimer: unknown;
  private sftpUnavailable = false;

  constructor(private readonly transport: SshTransport) {}

  home(): Promise<string> {
    return hostHomeDirectory(this.transport).catch((error: unknown) => {
      if (error instanceof TransportFailure && error.error.kind === 'timedOut') {
        throw failWith({ kind: 'hostFileTimedOut' });
      }
      throw error;
    });
  }

  status(path: string): Promise<HostFileStatus | null> {
    return this.withClient(path, async (client) => {
      const stat = await client.stat(path);
      return stat
        ? { size: stat.size, modificationTime: stat.modifiedAt, kind: hostFileKind(stat.kind) }
        : null;
    });
  }

  list(request: HostFileListingRequest): Promise<HostFileListing | null> {
    return this.withClient(request.directory, async (client) => {
      const listing = await client.list(request.directory, {
        kinds: request.kinds.map((kind) => KIND_TO_SFTP[kind]),
        namePrefix: request.namePrefix,
        maxEntries: request.maximumEntries,
        maxScanned: request.maximumScanned,
      });
      return listing
        ? {
            entries: listing.entries.map(({ name }) => ({ name })),
            truncated: listing.truncated,
            scanIncomplete: listing.scanIncomplete,
          }
        : null;
    });
  }

  read(range: HostFileRange): Promise<HostFileSlice> {
    return this.withClient(range.path, async (client) => {
      const slice = await client.readRange(range.path, range.offset, range.maxBytes);
      return { data: slice.data, length: slice.length };
    });
  }

  /** Releases the held channel (the connection is closing, or the screen left). */
  async close(): Promise<void> {
    await this.release();
  }

  private async withClient<T>(path: string, operation: (client: Sftp) => Promise<T>): Promise<T> {
    if (!isAcceptablePath(path)) throw failWith({ kind: 'invalidDirectoryPath', path });
    requirePosixHost(this.transport, 'Chat');
    if (this.sftpUnavailable)
      throw failWith({ kind: 'hostFeatureUnavailable', feature: SFTP_NEEDED });
    this.cancelIdle();
    this.readsInFlight += 1;
    try {
      return await withDeadline(
        this.transport.settings.clock,
        this.transport.requestBudgetMs,
        async () => operation(await this.acquireClient()),
      );
    } catch (thrown) {
      const { error, retiresChannel } = this.map(thrown);
      if (retiresChannel && this.readsInFlight === 1) await this.release();
      throw error;
    } finally {
      this.readsInFlight -= 1;
      this.scheduleIdle();
    }
  }

  private map(thrown: unknown): Mapped {
    if (thrown instanceof SshError) {
      switch (thrown.code) {
        case 'timedOut':
          return { error: failWith({ kind: 'hostFileTimedOut' }), retiresChannel: true };
        case 'sftpFailure':
          return {
            error: failWith({
              kind: 'hostFileUnreadable',
              status: sftpStatusOf(thrown) ?? GENERIC_SFTP_STATUS,
            }),
            retiresChannel: false,
          };
        case 'sftpUnavailable':
          this.sftpUnavailable = true;
          return {
            error: failWith({ kind: 'hostFeatureUnavailable', feature: SFTP_NEEDED }),
            retiresChannel: true,
          };
        case 'cancelled':
          return { error: failWith({ kind: 'cancelled' }), retiresChannel: false };
        default:
          return { error: this.transport.fail(thrown), retiresChannel: true };
      }
    }
    if (thrown instanceof TransportFailure) {
      const kind: TransportError['kind'] = thrown.error.kind;
      if (kind === 'timedOut') {
        return { error: failWith({ kind: 'hostFileTimedOut' }), retiresChannel: true };
      }
      return { error: thrown, retiresChannel: kind !== 'cancelled' };
    }
    return { error: this.transport.fail(thrown), retiresChannel: true };
  }

  private acquireClient(): Promise<Sftp> {
    if (this.client) return Promise.resolve(this.client);
    if (!this.opening) {
      const opening = this.openClient().finally(() => {
        this.opening = undefined;
      });
      this.opening = opening;
    }
    return this.opening;
  }

  private async openClient(): Promise<Sftp> {
    const lease = await this.transport.admission.acquire('ordinarySession');
    let client: Sftp;
    try {
      client = await this.transport.session.sftp({ timeoutMs: this.transport.requestBudgetMs });
    } catch (thrown) {
      lease.release();
      throw thrown;
    }
    if (!(await this.transport.isConnected())) {
      await client.close().catch(() => undefined);
      lease.release();
      throw failWith({ kind: 'sshUnreachable', detail: 'The Host is not connected.' });
    }
    this.client = client;
    this.lease = lease;
    // A read whose deadline passed during the open has already left; do not wait for the next.
    this.scheduleIdle();
    return client;
  }

  private cancelIdle(): void {
    if (this.idleTimer === undefined) return;
    this.transport.settings.clock.clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  private scheduleIdle(): void {
    this.cancelIdle();
    if (this.readsInFlight > 0 || !this.client) return;
    this.idleTimer = this.transport.settings.clock.setTimeout(() => {
      this.idleTimer = undefined;
      if (this.readsInFlight === 0) void this.release();
    }, SESSION_FILE_IDLE_MS);
  }

  private async release(): Promise<void> {
    this.cancelIdle();
    const { client, lease } = this;
    this.client = undefined;
    this.lease = undefined;
    await client?.close().catch(() => undefined);
    lease?.release();
  }
}

export interface DirectoryListing {
  readonly directories: string[];
  readonly truncated: boolean;
}

/**
 * Directories-only SFTP listing of one absolute Host path (POSIX, Windows drive or UNC). An
 * invalid path fails before any channel opens; a missing directory is `hostFileUnreadable`.
 */
export async function listDirectories(
  transport: SshTransport,
  path: string,
): Promise<DirectoryListing> {
  const valid = path.startsWith('/') ? isQuotableAbsolutePath(path) : isAbsoluteHostPath(path);
  if (!valid) {
    throw failWith({ kind: 'invalidDirectoryPath', path });
  }
  return transport.admission.withChannel('ordinarySession', async () => {
    try {
      const sftp = await transport.session.sftp({ timeoutMs: transport.requestBudgetMs });
      try {
        const listing = await sftp.list(path, {
          kinds: ['directory'],
          timeoutMs: transport.requestBudgetMs,
        });
        if (!listing) throw failWith({ kind: 'hostFileUnreadable', status: 2 });
        return {
          directories: listing.entries.map((entry) => entry.name),
          truncated: listing.truncated,
        };
      } finally {
        await sftp.close().catch(() => undefined);
      }
    } catch (thrown) {
      throw thrown instanceof TransportFailure ? thrown : transport.fail(thrown);
    }
  });
}
