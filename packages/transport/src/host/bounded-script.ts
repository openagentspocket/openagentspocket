import {
  CancelledError,
  type CancelSignal,
  failWith,
  type TransportError,
  TransportFailure,
} from '@openagentspocket/core';
import { utf8Encode } from 'agentico-ssh';
import { withDeadline } from '../deadline';
import { DEFAULT_REQUEST_TIMEOUT_MS } from '../settings';
import type { SshTransport } from '../transport';
import { requirePosixHost } from './environment';

/** The script runs on stdin, so no path ever appears on the SSH command line. */
export const SCRIPT_SHELL = '/bin/sh -s';

export interface ScriptResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/**
 * Serializes runs of one feature on the Host. A run past its deadline keeps its place until its
 * exec has drained, so the next query never runs beside it; a waiter that times out leaves.
 */
export class ExecLane {
  private tail: Promise<void> = Promise.resolve();

  async run<T>(operation: () => Promise<T>, signal: CancelSignal): Promise<T> {
    const previous = this.tail;
    let release: () => void = () => {};
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        // Leave the queue, but keep the order: the next run still waits for the one before us.
        previous.then(release);
        reject(new CancelledError());
      };
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
      previous.then(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      });
    });
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

/**
 * Wraps `script` in a remote watchdog that ends the exec's process group after `remoteSeconds`
 * and reports `timeoutMarker` on stderr. sshd gives each exec its own process group; the
 * watchdog's marker descriptor is closed in `sleep` so a surviving timer cannot hold an SSH
 * output pipe open after normal completion.
 */
export function boundedScript(
  script: string,
  remoteSeconds: number,
  timeoutMarker: string,
): string {
  return `{
(
    sleep ${remoteSeconds} 3>&-
    printf '\\n%s\\n' '${timeoutMarker}' >&3
    kill -KILL 0
) </dev/null >/dev/null 3>&2 2>/dev/null &
__agentico_git_watchdog=$!
(
${script}
) </dev/null
__agentico_git_status=$?
{
    kill -KILL "$__agentico_git_watchdog"
    wait "$__agentico_git_watchdog"
} >/dev/null 2>&1
exit "$__agentico_git_status"
} </dev/null
`;
}

export interface BoundedScriptOptions {
  /** Named in the refusal on a native Windows Host. */
  readonly feature: string;
  /** The caller's whole budget, admission and lane wait included. */
  readonly deadlineMs: number;
  /** The remote watchdog's bound, whole seconds. */
  readonly remoteSeconds: number;
  readonly timeoutMarkerPrefix: string;
  /** What the feature reports when the budget or the watchdog ends the run. */
  readonly timedOut: TransportError;
  readonly lane?: ExecLane;
  readonly nonce?: () => string;
}

const randomNonce = () => Math.random().toString(16).slice(2, 14).padEnd(12, '0');

/**
 * One script in one bounded exec, for each feature that reads the Host through a script. The
 * channel is held until the remote watchdog ends the process group and SSH observes its exit.
 */
export async function runBoundedScript(
  transport: SshTransport,
  script: string,
  options: BoundedScriptOptions,
): Promise<ScriptResult> {
  requirePosixHost(transport, options.feature);
  const marker = `${options.timeoutMarkerPrefix}${(options.nonce ?? randomNonce)()}__`;
  const input = utf8Encode(boundedScript(script, options.remoteSeconds, marker));
  // Startup, transfer and reap time sit outside the remote bound.
  const exchangeMs =
    options.remoteSeconds * 1000 + Math.max(transport.requestBudgetMs, DEFAULT_REQUEST_TIMEOUT_MS);
  const exec = async (): Promise<ScriptResult> => {
    const result = await transport.runExec(SCRIPT_SHELL, exchangeMs, input);
    if (result.stderr.includes(marker)) throw failWith(options.timedOut);
    return result;
  };
  try {
    return await withDeadline(transport.settings.clock, options.deadlineMs, (signal) =>
      options.lane ? options.lane.run(exec, signal) : exec(),
    );
  } catch (error) {
    if (error instanceof TransportFailure && error.error.kind === 'timedOut') {
      throw failWith(options.timedOut);
    }
    if (error instanceof CancelledError) throw failWith({ kind: 'cancelled' });
    throw error;
  }
}
