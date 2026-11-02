import { TransportFailure } from '../errors/transport-error';
import { BoundedQueue } from '../events/bounded-queue';
import type { TerminalAttachRequest, TerminalAttachSession, TerminalSessionRunner } from './types';

/** A scripted attach session for tests: push output, end it, read what the store sent. */
export class ScriptedTerminalSession implements TerminalAttachSession {
  readonly sent: Uint8Array[] = [];
  readonly sizes: Array<[number, number]> = [];
  readonly scrolls: number[] = [];
  ended = 0;
  private readonly queue = new BoundedQueue<Uint8Array>();

  get output(): AsyncIterable<Uint8Array> {
    return this.queue;
  }
  send(keystrokes: Uint8Array) {
    this.sent.push(keystrokes);
  }
  scroll(_sequence: Uint8Array, rows: number) {
    this.scrolls.push(rows);
  }
  resize(cols: number, rows: number) {
    this.sizes.push([cols, rows]);
  }
  async end() {
    this.ended += 1;
    this.queue.finish();
  }
  emit(bytes: Uint8Array) {
    this.queue.push(bytes);
  }
  /** The remote ended: cleanly, or with a failure. */
  finish(error?: TransportFailure) {
    this.queue.finish(error);
  }
}

/**
 * A runner whose every attempt is scripted: `attempts[i]` decides what attempt `i` does with the
 * request. Records requests; an attempt that returns a session gets the full handler lifecycle.
 */
export function scriptedRunner(
  attempts: ReadonlyArray<
    (
      request: TerminalAttachRequest,
    ) => Promise<{ session: ScriptedTerminalSession; generation?: number } | never>
  >,
): { runner: TerminalSessionRunner; requests: TerminalAttachRequest[] } {
  const requests: TerminalAttachRequest[] = [];
  const runner: TerminalSessionRunner = async (request, handler, signal) => {
    const attempt = attempts[Math.min(requests.length, attempts.length - 1)];
    requests.push(request);
    if (!attempt) throw new TransportFailure({ kind: 'cancelled' });
    const aborted = new Promise<never>((_, reject) => {
      signal.addEventListener('abort', () => reject(new TransportFailure({ kind: 'cancelled' })), {
        once: true,
      });
    });
    const { session, generation } = await Promise.race([attempt(request), aborted]);
    if (generation !== undefined) handler.transportDidBecomeReady(generation);
    await handler.runEndingSession(session);
  };
  return { runner, requests };
}
