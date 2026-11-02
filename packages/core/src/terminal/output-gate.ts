import type { TransportError } from '../errors/transport-error';
import { TransportFailure } from '../errors/transport-error';
import { BoundedQueue } from '../events/bounded-queue';

/**
 * The attach session's output, with the rules Swift's output gate enforced:
 * - one reader claims it; a second reader's first read is refused with `terminalChannelAlreadyOpen`
 *   and leaves the first reader's iteration alone;
 * - an explicit end discards unread and later output and finishes without error;
 * - otherwise a finish delivers everything accepted first, then ends (or rejects).
 */
export class AttachOutputGate {
  private readonly queue = new BoundedQueue<Uint8Array>();
  private claimant: object | null = null;
  private explicitlyEnded = false;

  yield(bytes: Uint8Array): void {
    if (this.explicitlyEnded || bytes.length === 0) return;
    this.queue.push(bytes);
  }

  finish(error?: TransportError): void {
    this.queue.finish(error ? new TransportFailure(error) : undefined);
  }

  /** The reader asked to end: stop delivering, even what is buffered. */
  beginExplicitEnd(): void {
    this.explicitlyEnded = true;
    this.queue.finish();
  }

  makeOutput(): AsyncIterable<Uint8Array> {
    const reader = {};
    return {
      [Symbol.asyncIterator]: () => ({
        next: async (): Promise<IteratorResult<Uint8Array, undefined>> => {
          if (this.claimant === null) this.claimant = reader;
          if (this.claimant !== reader) {
            throw new TransportFailure({ kind: 'terminalChannelAlreadyOpen' });
          }
          if (this.explicitlyEnded) return { value: undefined, done: true };
          return this.queue.next();
        },
      }),
    };
  }
}
