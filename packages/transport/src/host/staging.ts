import { type CancelSignal, TransportFailure } from '@openagentspocket/core';
import { SshError } from 'agentico-ssh';
import type { SshTransport } from '../transport';
import { markerValue } from '../transport';
import { requirePosixHost } from './environment';
import { cLocale } from './shell';

// Attachment staging: one image or file written over SFTP into private Host temporary storage
// and renamed into place (ADR 0006).

export const STAGE_DIRECTORY_MARKER = '__AGENTICO_STAGE_DIR__=';
export const STAGE_DIRECTORY_COMMAND =
  `/bin/sh -c 'umask 077; ` +
  `directory=$(mktemp -d "\${TMPDIR:-/tmp}/agentico.XXXXXXXX") || exit 1; ` +
  `printf "${STAGE_DIRECTORY_MARKER}%s\\n" "$directory"'`;

export type StagingErrorKind =
  | 'invalidRemotePath'
  | 'invalidPreparedSource'
  | 'localReadFailed'
  | 'remoteTemporaryDirectoryFailed'
  | 'sftpUnavailable'
  | 'permissionEnforcementFailed'
  | 'byteCountMismatch'
  | 'transferFailed'
  | 'cancelled';

export class StagingError extends Error {
  override readonly name = 'StagingError';
  constructor(readonly kind: StagingErrorKind) {
    super(`StagingError.${kind}`);
  }

  /** Only a failed transfer or a cancel is worth trying again unchanged. */
  get isRetryable(): boolean {
    return this.kind === 'transferFailed' || this.kind === 'cancelled';
  }
}

/** A prepared local attachment: its size is checked against what `read` returns. */
export interface StagingSource {
  readonly byteCount: number;
  /** `image.<ext>` for an image, the file's own name for a file. */
  readonly remoteFilename: string;
  /** All of the attachment's bytes. */
  read(): Promise<Uint8Array>;
}

export interface StageProgress {
  readonly transferredBytes: number;
  readonly totalBytes: number;
}

export interface StageOptions {
  /** The largest attachment of its kind; a source over it is refused. */
  readonly maxBytes: number;
  readonly onProgress?: (progress: StageProgress) => void;
  readonly signal?: CancelSignal;
  /** Eight hex characters naming the stage folder. */
  readonly token?: () => string;
}

/** An absolute Host path with no control characters. */
export function isValidStagedPath(path: string): boolean {
  if (!path.startsWith('/') || path === '/') return false;
  for (const char of path) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

const randomToken = () => Math.random().toString(16).slice(2, 14).padEnd(12, '0');

function throwIfCancelled(signal: CancelSignal | undefined): void {
  if (signal?.aborted) throw new StagingError('cancelled');
}

async function createStageParentDirectory(transport: SshTransport): Promise<string> {
  try {
    const result = await transport.runExec(cLocale(STAGE_DIRECTORY_COMMAND));
    const directory =
      result.exitCode === 0 ? markerValue(result.stdout, STAGE_DIRECTORY_MARKER) : null;
    if (!directory || !isValidStagedPath(directory)) {
      throw new StagingError('remoteTemporaryDirectoryFailed');
    }
    return directory;
  } catch (thrown) {
    if (thrown instanceof StagingError) throw thrown;
    if (thrown instanceof TransportFailure && thrown.error.kind === 'cancelled') {
      throw new StagingError('cancelled');
    }
    if (!(await transport.isConnected())) throw new StagingError('transferFailed');
    throw new StagingError('remoteTemporaryDirectoryFailed');
  }
}

/**
 * Stages one attachment on the Host and returns its path: a private `0700` folder under the
 * Host's temp dir, the bytes written to a `.part` file and renamed into place, sizes checked on
 * both sides. The SFTP client reports no permission bits, so `0600` is requested on the write and
 * enforced with chmod but not read back.
 */
export async function stageAttachment(
  transport: SshTransport,
  source: StagingSource,
  options: StageOptions,
): Promise<string> {
  if (source.byteCount <= 0 || source.byteCount > options.maxBytes) {
    throw new StagingError('invalidPreparedSource');
  }
  requirePosixHost(transport, 'File and image uploads');
  if (!(await transport.isConnected())) throw new StagingError('transferFailed');
  const report = (transferredBytes: number) =>
    options.onProgress?.({ transferredBytes, totalBytes: source.byteCount });
  report(0);
  throwIfCancelled(options.signal);
  const parent = await createStageParentDirectory(transport);

  let data: Uint8Array;
  try {
    data = await source.read();
  } catch {
    throw new StagingError('localReadFailed');
  }
  if (data.length !== source.byteCount) throw new StagingError('byteCountMismatch');

  const remoteDirectory = `${parent}/stage-${(options.token ?? randomToken)()}`;
  const finalPath = `${remoteDirectory}/${source.remoteFilename}`;
  const partPath = `${finalPath}.part`;
  if (!isValidStagedPath(finalPath)) throw new StagingError('invalidRemotePath');

  return transport.admission.withChannel('ordinarySession', async () => {
    let sftp: Awaited<ReturnType<SshTransport['session']['sftp']>>;
    try {
      sftp = await transport.session.sftp({ timeoutMs: transport.requestBudgetMs });
    } catch (thrown) {
      if (thrown instanceof SshError && thrown.code === 'sftpUnavailable') {
        throw new StagingError('sftpUnavailable');
      }
      throw new StagingError(options.signal?.aborted ? 'cancelled' : 'transferFailed');
    }
    let partWritten = false;
    try {
      await sftp.chmod(parent, 0o700);
      await sftp.mkdir(remoteDirectory, { permissions: 0o700 });
      await sftp.chmod(remoteDirectory, 0o700);
      throwIfCancelled(options.signal);
      await sftp.write(partPath, data, { permissions: 0o600 });
      partWritten = true;
      await sftp.chmod(partPath, 0o600);
      throwIfCancelled(options.signal);
      const uploaded = await sftp.stat(partPath);
      if (uploaded?.size !== source.byteCount) throw new StagingError('byteCountMismatch');
      await sftp.rename(partPath, finalPath);
      partWritten = false;
      const placed = await sftp.stat(finalPath);
      if (placed?.size !== source.byteCount) throw new StagingError('byteCountMismatch');
      report(source.byteCount);
      return finalPath;
    } catch (thrown) {
      // The attachment's bytes must not outlive the failed operation.
      if (partWritten) await sftp.unlink(partPath).catch(() => undefined);
      if (options.signal?.aborted) throw new StagingError('cancelled');
      if (thrown instanceof StagingError) throw thrown;
      if (thrown instanceof SshError && thrown.code === 'sftpUnavailable') {
        throw new StagingError('sftpUnavailable');
      }
      throw new StagingError('transferFailed');
    } finally {
      await sftp.close().catch(() => undefined);
    }
  });
}
