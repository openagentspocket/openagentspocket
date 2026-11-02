// Cancellation and timers without DOM types: core compiles with `lib: ES2022`
// only. A real AbortSignal satisfies `CancelSignal`; tests drive `FakeClock`.

/** The part of AbortSignal the hosts module uses. */
export interface CancelSignal {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

/** Thrown when a caller cancels: the counterpart of Swift's CancellationError. */
export class CancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'CancelledError';
  }
}

export interface Cancellation {
  readonly signal: CancelSignal;
  cancel(): void;
}

/** A minimal AbortController: listeners run once, on the first cancel. */
export function createCancellation(): Cancellation {
  let aborted = false;
  const listeners = new Set<() => void>();
  const signal: CancelSignal = {
    get aborted() {
      return aborted;
    },
    addEventListener(_type, listener) {
      if (!aborted) listeners.add(listener);
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener);
    },
  };
  return {
    signal,
    cancel() {
      if (aborted) return;
      aborted = true;
      const pending = [...listeners];
      listeners.clear();
      for (const listener of pending) listener();
    },
  };
}

/** Timers, injectable so races and backoffs run on a fake clock in tests. */
export interface Clock {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  /** Monotonic milliseconds, for elapsed-time checks (keepalive, round trips). */
  monotonicMs(): number;
}

/**
 * A manual clock: time moves only on `advance`, which fires due timers in
 * order (ties by scheduling order) and lets their promise reactions settle
 * (through `settle`, which tests may replace with a deeper drain such as
 * `() => new Promise((resolve) => setImmediate(resolve))`).
 */
export class FakeClock implements Clock {
  private current = 0;
  private nextHandle = 1;
  private readonly timers = new Map<number, { at: number; callback: () => void }>();

  constructor(private readonly settle: () => Promise<void> = () => flushMicrotasks()) {}

  get now(): number {
    return this.current;
  }

  monotonicMs(): number {
    return this.current;
  }

  get pendingTimers(): number {
    return this.timers.size;
  }

  setTimeout(callback: () => void, ms: number): unknown {
    const handle = this.nextHandle++;
    this.timers.set(handle, { at: this.current + Math.max(0, ms), callback });
    return handle;
  }

  clearTimeout(handle: unknown): void {
    if (typeof handle === 'number') this.timers.delete(handle);
  }

  async advance(ms: number): Promise<void> {
    const target = this.current + ms;
    for (;;) {
      await this.settle();
      let due: [number, { at: number; callback: () => void }] | undefined;
      for (const entry of this.timers) {
        if (entry[1].at <= target && (!due || entry[1].at < due[1].at)) due = entry;
      }
      if (!due) break;
      this.timers.delete(due[0]);
      this.current = due[1].at;
      due[1].callback();
    }
    this.current = target;
    await this.settle();
  }

  /** Lets pending promise work run without moving time. */
  flush(): Promise<void> {
    return this.settle();
  }
}

/** Lets pending promise reactions run (a few turns cover chained `then`s). */
export async function flushMicrotasks(turns = 20): Promise<void> {
  for (let i = 0; i < turns; i++) await Promise.resolve();
}
