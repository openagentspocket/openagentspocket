import { TransportFailure } from '../errors/transport-error';
import { encodeUtf8 } from '../events/utf8';
import { CancelledError, type CancelSignal } from '../hosts/cancellation';
import { shellWord } from '../hosts/herdr-command-line';
import { FileBrowserError, fileBrowserFailure, sftpStatusOf, tooLarge } from './errors';
import { FILE_LIMITS } from './limits';
import { isLeftoverPart, partName } from './parts';
import { looksSecret, nameProblem, RemotePath } from './path';
import type {
  DownloadRequest,
  FileBrowserHost,
  FileKind,
  FileListing,
  FileStat,
  LocalFiles,
  ProgressSink,
  UploadRequest,
} from './ports';

/** The part of `Sftp` (modules/ssh) the file browser uses; the real client satisfies it. */
export interface FileSftp {
  stat(path: string, options?: { followSymlinks?: boolean }): Promise<FileStat | null>;
  list(
    path: string,
    options?: { maxEntries?: number; maxScanned?: number },
  ): Promise<{
    entries: Array<FileStat & { name: string }>;
    truncated: boolean;
    scanIncomplete: boolean;
  } | null>;
  readRange(
    path: string,
    offset: number,
    maxBytes: number,
  ): Promise<{ data: Uint8Array; length: number | null }>;
  write(path: string, data: Uint8Array, options?: { permissions?: number }): Promise<void>;
  rename(from: string, to: string, options?: { overwrite?: boolean }): Promise<void>;
  unlink(path: string): Promise<void>;
  rmdir(path: string): Promise<void>;
  chmod(path: string, permissions: number): Promise<void>;
  close(): Promise<void>;
}

/** The part of `SshSession` the file browser uses. */
export interface FileSshSession {
  exec(
    command: string,
    options?: { input?: Uint8Array },
  ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  sftp(): Promise<FileSftp>;
}

export interface SftpHostOptions {
  /** Serializes git execs on the Host (shared with Changes). Default: run at once. */
  gitGate?: <T>(run: () => Promise<T>) => Promise<T>;
  /** Eight hex characters for `.part` names. */
  token?: () => string;
  /** Seconds since 1970. */
  now?: () => number;
  /** Milliseconds, for throttling progress reports. */
  monotonicMs?: () => number;
}

export const HOME_COMMAND = `/bin/sh -c 'printf "__AGENTICO_HOME__=%s\\n" "$HOME"'`;
const HOME_PREFIX = '__AGENTICO_HOME__=';
/** OpenSSH's catch-all failure: a rename onto an existing name, a folder with entries, other refusals. */
const SFTP_FAILURE = 4;

const randomToken = () =>
  Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

function throwIfCancelled(signal: CancelSignal) {
  if (signal.aborted) throw new CancelledError();
}

/**
 * The file browser's Host over SFTP. Every operation opens an SFTP channel of its own and closes
 * it after, so a browser left open never holds one of the Host's session slots and a large
 * download never stalls a transcript read.
 */
export class SftpFileBrowserHost implements FileBrowserHost {
  private home: Promise<string> | undefined;
  /** Parts this launch wrote and could not remove: the next listing removes them. */
  private readonly abandoned = new Set<string>();

  constructor(
    private readonly session: FileSshSession,
    private readonly local: LocalFiles,
    private readonly options: SftpHostOptions = {},
  ) {}

  homeDirectory(): Promise<string> {
    this.home ??= this.resolveHome().catch((error) => {
      this.home = undefined;
      throw error;
    });
    return this.home;
  }

  private async resolveHome(): Promise<string> {
    const result = await this.session.exec(HOME_COMMAND);
    const line = result.stdout.split('\n').find((l) => l.startsWith(HOME_PREFIX));
    const home = line?.slice(HOME_PREFIX.length).trim();
    if (result.exitCode !== 0 || !home || !RemotePath.isAcceptable(home)) {
      throw new TransportFailure({
        kind: 'homeDirectoryUnresolvable',
        detail: 'The home probe did not return an absolute path.',
      });
    }
    return home;
  }

  private requirePaths(...paths: string[]) {
    const bad = paths.find((path) => !RemotePath.isAcceptable(path));
    if (bad !== undefined) throw new TransportFailure({ kind: 'invalidDirectoryPath', path: bad });
  }

  private async withSftp<T>(operation: (sftp: FileSftp) => Promise<T>): Promise<T> {
    let sftp: FileSftp;
    try {
      sftp = await this.session.sftp();
    } catch (error) {
      throw fileBrowserFailure(error) ?? error;
    }
    try {
      return await operation(sftp);
    } catch (error) {
      throw fileBrowserFailure(error) ?? error;
    } finally {
      await sftp.close().catch(() => {});
    }
  }

  async list(path: string): Promise<FileListing> {
    this.requirePaths(path);
    return this.withSftp(async (sftp) => {
      const listing = await sftp.list(path, {
        maxEntries: FILE_LIMITS.listingEntries,
        maxScanned: FILE_LIMITS.listingScanned,
      });
      if (!listing) throw new FileBrowserError('notFound');
      const now = (this.options.now ?? (() => Date.now() / 1000))();
      const removed = new Set<string>();
      for (const entry of listing.entries) {
        const full = RemotePath.join(path, entry.name);
        if (!isLeftoverPart(entry, full, now, this.abandoned)) continue;
        try {
          await sftp.unlink(full);
        } catch (error) {
          if (sftpStatusOf(error) !== 2) continue;
        }
        this.abandoned.delete(full);
        removed.add(entry.name);
      }
      return {
        entries: listing.entries.filter((entry) => !removed.has(entry.name)),
        truncated: listing.truncated,
        scanIncomplete: listing.scanIncomplete,
      };
    });
  }

  async status(path: string): Promise<FileStat | null> {
    this.requirePaths(path);
    return this.withSftp((sftp) => sftp.stat(path));
  }

  async download(request: DownloadRequest, progress: ProgressSink, signal: CancelSignal) {
    this.requirePaths(request.path);
    await this.withSftp(async (sftp) => {
      const status = await sftp.stat(request.path);
      if (!status) throw new FileBrowserError('notFound');
      if (status.kind !== 'file') throw new FileBrowserError('notAFile');
      const expected = status.size ?? 0;
      if (expected > request.maximumBytes) throw tooLarge(request.maximumBytes);
      await this.copyDown(sftp, request, expected, progress, signal);
    });
  }

  private async copyDown(
    sftp: FileSftp,
    request: DownloadRequest,
    expected: number,
    progress: ProgressSink,
    signal: CancelSignal,
  ) {
    const monotonicMs = this.options.monotonicMs ?? Date.now;
    const writer = await this.local.openWriter(request.destination);
    let written = 0;
    try {
      progress({ transferredBytes: 0, totalBytes: expected });
      let lastReport = monotonicMs();
      for (;;) {
        throwIfCancelled(signal);
        const slice = await sftp.readRange(request.path, written, FILE_LIMITS.downloadChunkBytes);
        if (slice.length === null) throw new FileBrowserError('notFound');
        if (slice.data.length === 0) break;
        written += slice.data.length;
        if (written > request.maximumBytes) throw tooLarge(request.maximumBytes);
        try {
          await writer.append(slice.data);
        } catch {
          throw new FileBrowserError('localStorageFailed');
        }
        const now = monotonicMs();
        if (now - lastReport >= FILE_LIMITS.progressIntervalMs) {
          lastReport = now;
          progress({ transferredBytes: written, totalBytes: Math.max(expected, written) });
        }
      }
      await writer.close();
    } catch (error) {
      await writer.close().catch(() => {});
      await this.local.remove(request.destination).catch(() => {});
      throw error;
    }
    progress({ transferredBytes: written, totalBytes: Math.max(expected, written) });
  }

  /**
   * The bytes land in a hidden, uniquely named `.part` (0600) that only a complete, size-checked
   * upload renames into place, so a failed or cancelled one never leaves a truncated file under the
   * user's name. A part that cannot be removed after a failure is remembered for the next listing.
   * The SSH module writes a file in one call, so progress reports the start and the end only.
   */
  async upload(request: UploadRequest, progress: ProgressSink, signal: CancelSignal) {
    this.requirePaths(request.directory);
    const problem = nameProblem(request.name);
    if (problem) throw new FileBrowserError('invalidName', { reason: problem });
    if (request.byteCount > FILE_LIMITS.uploadBytes) throw tooLarge(FILE_LIMITS.uploadBytes);
    if ((await this.local.size(request.source)) !== request.byteCount) {
      throw new FileBrowserError('localStorageFailed');
    }
    const destination = RemotePath.join(request.directory, request.name);
    const part = RemotePath.join(
      request.directory,
      partName(request.name, (this.options.token ?? randomToken)()),
    );
    await this.withSftp(async (sftp) => {
      // A link is never replaced: the rename would swap the link, not what it points to.
      const existing = await sftp.stat(destination, { followSymlinks: false });
      const replacing = existing !== null && request.replacesExisting;
      if (
        existing &&
        (!replacing || existing.kind === 'directory' || existing.kind === 'symlink')
      ) {
        throw new FileBrowserError('alreadyExists');
      }
      // The module cannot read a mode: a replaced file falls back to private, as does a secret.
      const permissions = replacing || looksSecret(request.name) ? 0o600 : 0o644;
      try {
        throwIfCancelled(signal);
        const data = await this.local.readAll(request.source).catch(() => {
          throw new FileBrowserError('localStorageFailed');
        });
        progress({ transferredBytes: 0, totalBytes: request.byteCount });
        await sftp.write(part, data, { permissions: 0o600 });
        throwIfCancelled(signal);
        if ((await sftp.stat(part))?.size !== request.byteCount) {
          throw new FileBrowserError('transferIncomplete');
        }
        await sftp.chmod(part, permissions);
        await this.renameRefusingExisting(sftp, part, destination, replacing);
        progress({ transferredBytes: request.byteCount, totalBytes: request.byteCount });
      } catch (error) {
        try {
          await sftp.unlink(part);
        } catch (cleanup) {
          if (sftpStatusOf(cleanup) !== 2) this.abandoned.add(part);
        }
        throw error;
      }
    });
  }

  /** A refused rename cannot say why, so it looks again: a destination that is there is "exists". */
  private async renameRefusingExisting(
    sftp: FileSftp,
    from: string,
    to: string,
    overwrite: boolean,
  ) {
    if (!overwrite && (await sftp.stat(to, { followSymlinks: false }))) {
      throw new FileBrowserError('alreadyExists');
    }
    try {
      await sftp.rename(from, to, { overwrite });
    } catch (error) {
      if (!overwrite && (await sftp.stat(to, { followSymlinks: false }))) {
        throw new FileBrowserError('alreadyExists');
      }
      throw error;
    }
  }

  async rename(path: string, newName: string) {
    this.requirePaths(path);
    const problem = nameProblem(newName);
    if (problem) throw new FileBrowserError('invalidName', { reason: problem });
    const parent = RemotePath.parent(path);
    if (RemotePath.isSystemPath(path) || parent === null)
      throw new FileBrowserError('protectedItem');
    const destination = RemotePath.join(parent, newName);
    if (destination === path) return;
    await this.withSftp((sftp) => this.renameRefusingExisting(sftp, path, destination, false));
  }

  async delete(path: string, kind: FileKind) {
    this.requirePaths(path);
    if (RemotePath.isSystemPath(path)) throw new FileBrowserError('protectedItem');
    await this.withSftp(async (sftp) => {
      // A symlink goes as a link: its target is never touched.
      if (kind !== 'directory') return sftp.unlink(path);
      try {
        await sftp.rmdir(path);
      } catch (error) {
        const status = sftpStatusOf(error);
        if (
          (error as { code?: string }).code !== 'sftpFailure' ||
          (status !== null && status !== SFTP_FAILURE)
        ) {
          throw error;
        }
        // "Not empty" only when the folder still lists an entry; a mount point stays a refusal.
        const probe = await sftp.list(path, { maxEntries: 1, maxScanned: 3 }).catch(() => null);
        throw probe && probe.entries.length > 0
          ? new FileBrowserError('directoryNotEmpty')
          : new FileBrowserError('refused', { status: status ?? SFTP_FAILURE });
      }
    });
  }

  /**
   * One bounded `git check-ignore` exec: only the listed names are asked about, NUL separated on
   * standard input, each as `./<name>` so no pathspec magic parses it. Exit 1 means "none ignored",
   * which is an answer; anything else, or no git, dims nothing.
   */
  async ignoredNames(
    directory: string,
    candidates: readonly string[],
  ): Promise<ReadonlySet<string>> {
    this.requirePaths(directory);
    if (candidates.length === 0) return new Set();
    const input = encodeUtf8(candidates.map((name) => `./${name}\0`).join(''));
    const command = `GIT_OPTIONAL_LOCKS=0 git -c core.fsmonitor=false -C ${shellWord(directory)} check-ignore -z --stdin`;
    const run = () => this.session.exec(command, { input });
    const result = await (this.options.gitGate ? this.options.gitGate(run) : run());
    if (result.exitCode !== 0 && result.exitCode !== 1) return new Set();
    const asked = new Set(candidates);
    const names = result.stdout
      .split('\0')
      .filter((record) => record !== '')
      .map((record) => (record.startsWith('./') ? record.slice(2) : record));
    return new Set(names.filter((name) => asked.has(name)));
  }
}
