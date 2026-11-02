import { concatBytes } from '../chat/model/host-files';
import type { CancelSignal, Clock } from '../hosts/cancellation';

/** Input riding down a live Attach session. Keystrokes and resizes are reliable; scrolling is lossy. */
export type TerminalAttachInput =
  | { readonly kind: 'keystrokes'; readonly data: Uint8Array }
  | { readonly kind: 'scroll'; readonly data: Uint8Array }
  | { readonly kind: 'resize'; readonly cols: number; readonly rows: number };

export const MAXIMUM_PENDING_SCROLL_ROWS = 12;
export const MAXIMUM_SCROLL_ROWS_PER_WRITE = 3;
export const SCROLL_PACING_MS = 33;

interface PendingScroll {
  sequence: Uint8Array;
  rows: number;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

function repeated(sequence: Uint8Array, count: number): Uint8Array {
  return concatBytes(Array.from({ length: count }, () => sequence));
}

/**
 * The live PTY's mixed-reliability input queue. Keystrokes and resizes are reliable and
 * ordered. Touch scrolling is an ephemeral viewport intent: keeping every momentum row under
 * backpressure only makes stale scrolling delay later keyboard input, so scroll rows are
 * coalesced, bounded and discarded as soon as a reliable key arrives. The writer asks for one
 * item only after the previous write completes, so priority is decided at the last useful
 * moment. One consumer. (Swift `TerminalAttachInputQueue`.)
 */
export class TerminalAttachInputQueue {
  private reliable: TerminalAttachInput[] = [];
  private pendingScroll: PendingScroll | null = null;
  private waiter: ((input: TerminalAttachInput | null) => void) | null = null;
  private finished = false;

  send(keystrokes: Uint8Array): void {
    if (keystrokes.length === 0) return;
    this.enqueueReliable({ kind: 'keystrokes', data: keystrokes }, true);
  }

  scroll(sequence: Uint8Array, rows: number): void {
    if (sequence.length === 0 || rows <= 0 || this.finished) return;
    const waiter = this.waiter;
    if (waiter) {
      this.waiter = null;
      const delivered = Math.min(rows, MAXIMUM_SCROLL_ROWS_PER_WRITE);
      const remaining = Math.min(rows - delivered, MAXIMUM_PENDING_SCROLL_ROWS - delivered);
      if (remaining > 0) this.pendingScroll = { sequence, rows: remaining };
      waiter({ kind: 'scroll', data: repeated(sequence, delivered) });
      return;
    }
    const pending = this.pendingScroll;
    if (pending && sameBytes(pending.sequence, sequence)) {
      pending.rows = Math.min(MAXIMUM_PENDING_SCROLL_ROWS, pending.rows + rows);
    } else {
      // A direction change makes the previous momentum stale.
      this.pendingScroll = { sequence, rows: Math.min(rows, MAXIMUM_PENDING_SCROLL_ROWS) };
    }
  }

  resize(cols: number, rows: number): void {
    this.enqueueReliable({ kind: 'resize', cols, rows }, false);
  }

  /** The next item, or null once finished and drained. */
  next(): Promise<TerminalAttachInput | null> {
    const reliable = this.reliable.shift();
    if (reliable) return Promise.resolve(reliable);
    const scroll = this.pendingScroll;
    if (scroll) {
      const delivered = Math.min(scroll.rows, MAXIMUM_SCROLL_ROWS_PER_WRITE);
      const remaining = scroll.rows - delivered;
      this.pendingScroll = remaining > 0 ? { sequence: scroll.sequence, rows: remaining } : null;
      return Promise.resolve({ kind: 'scroll', data: repeated(scroll.sequence, delivered) });
    }
    if (this.finished) return Promise.resolve(null);
    if (this.waiter) throw new Error('Attach input has more than one consumer');
    return new Promise((resolve) => {
      this.waiter = resolve;
    });
  }

  /** Explicit shutdown still drains reliable input already accepted; only scroll momentum is abandoned. */
  finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.pendingScroll = null;
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.(null);
  }

  private enqueueReliable(input: TerminalAttachInput, discardingScroll: boolean): void {
    if (this.finished) return;
    if (discardingScroll) this.pendingScroll = null;
    const waiter = this.waiter;
    if (waiter && this.reliable.length === 0) {
      this.waiter = null;
      waiter(input);
    } else {
      this.reliable.push(input);
    }
  }

  /**
   * Drains the queue onto a live PTY until it finishes or `signal` aborts. Scroll batches are
   * paced so momentum cannot monopolize the channel ahead of keystrokes.
   */
  async pump(
    clock: Clock,
    write: (data: Uint8Array) => Promise<void>,
    resize: (cols: number, rows: number) => Promise<void>,
    signal?: CancelSignal,
  ): Promise<void> {
    for (;;) {
      const item = await this.next();
      if (!item || signal?.aborted) return;
      if (item.kind === 'resize') {
        await resize(item.cols, item.rows);
      } else {
        await write(item.data);
        if (item.kind === 'scroll') {
          await new Promise<void>((resolve) => clock.setTimeout(resolve, SCROLL_PACING_MS));
        }
      }
    }
  }
}
