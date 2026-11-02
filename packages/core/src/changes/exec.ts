import { TransportFailure } from '../errors/transport-error';
import type { CancelSignal } from '../hosts/cancellation';
import { CancelledError } from '../hosts/cancellation';
import { encodeText, toBytes } from './bytes';
import { parseChanges } from './parse-changes';
import { parsePatch } from './patch';
import {
  changesScript,
  makeNonce,
  patchScript,
  SHELL_INVOCATION,
  untrackedDirectoryScript,
} from './script';
import type {
  ChangesReadRequest,
  CheckoutChangesRead,
  FilePatch,
  FilePatchRequest,
  UntrackedDirectoryListing,
  UntrackedDirectoryRequest,
} from './types';
import { parseUntrackedDirectory } from './untracked-directory';

/** One git exec has this long before the read fails with `gitTimedOut`. */
export const GIT_DEADLINE_MS = 10_000;

/**
 * Runs a command with bytes on stdin. `SshSession.exec` fits:
 * `(command, options) => session.exec(command, options)`. Output arrives already decoded as
 * UTF-8, so a non-UTF-8 path byte reads back replaced.
 */
export type ShellExec = (
  command: string,
  options: { input: Uint8Array; timeoutMs: number },
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

function failureCode(thrown: unknown): string | null {
  if (typeof thrown === 'object' && thrown !== null && 'code' in thrown) {
    const { code } = thrown as { code: unknown };
    return typeof code === 'string' ? code : null;
  }
  return null;
}

/** One script, run under the git deadline; SSH timeouts and cancellation map to transport errors. */
async function runScript(
  exec: ShellExec,
  script: string,
  signal: CancelSignal,
  deadlineMs: number,
): Promise<{ stdout: string; stderr: string }> {
  if (signal.aborted) throw new CancelledError();
  try {
    const result = await exec(SHELL_INVOCATION, { input: toBytes(script), timeoutMs: deadlineMs });
    if (signal.aborted) throw new CancelledError();
    // The Host's text is UTF-8; parsing works on bytes.
    return { stdout: encodeText(result.stdout), stderr: encodeText(result.stderr) };
  } catch (thrown) {
    if (thrown instanceof CancelledError || thrown instanceof TransportFailure) throw thrown;
    const code = failureCode(thrown);
    if (code === 'timedOut') throw new TransportFailure({ kind: 'gitTimedOut' });
    if (code === 'cancelled') throw new TransportFailure({ kind: 'cancelled' });
    throw thrown;
  }
}

export interface ChangesReaders {
  read(request: ChangesReadRequest, signal: CancelSignal): Promise<CheckoutChangesRead>;
  readPatch(request: FilePatchRequest, signal: CancelSignal): Promise<FilePatch>;
  listUntrackedDirectory(
    request: UntrackedDirectoryRequest,
    signal: CancelSignal,
  ): Promise<UntrackedDirectoryListing>;
}

/** The three exec-backed reads a `ChangesStore` needs, over one Host's shell. */
export function createChangesReaders(
  exec: ShellExec,
  options: { deadlineMs?: number; nonce?: () => string } = {},
): ChangesReaders {
  const deadline = options.deadlineMs ?? GIT_DEADLINE_MS;
  const nonce = options.nonce ?? makeNonce;
  return {
    async read(request, signal) {
      const id = nonce();
      const out = await runScript(exec, changesScript(request.directory, id), signal, deadline);
      return parseChanges(out, id);
    },
    async readPatch(request, signal) {
      const id = nonce();
      const out = await runScript(exec, patchScript(request, id), signal, deadline);
      return parsePatch(out, id, request);
    },
    async listUntrackedDirectory(request, signal) {
      const id = nonce();
      const script = untrackedDirectoryScript(request.topLevel, request.directory, id);
      const out = await runScript(exec, script, signal, deadline);
      return parseUntrackedDirectory(out, id, request.directory);
    },
  };
}
