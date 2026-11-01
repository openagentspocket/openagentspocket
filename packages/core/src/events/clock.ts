/**
 * Time, injected. Core stays free of platform timers so every timeout,
 * backoff and keepalive runs on a fake clock in tests; the app passes one
 * backed by `setTimeout` and `performance.now()`.
 */
export interface Clock {
  /** Monotonic milliseconds. */
  now(): number;
  /** Calls `callback` once after `ms`; the returned function cancels it. */
  setTimer(ms: number, callback: () => void): () => void;
}

export interface Sleep {
  /** Resolves when the delay elapses or the sleep is cancelled. */
  readonly done: Promise<void>;
  cancel(): void;
}

/** A cancellable delay. Cancelling resolves early: callers re-check state. */
export function sleep(clock: Clock, ms: number): Sleep {
  let wake = () => {};
  const done = new Promise<void>((resolve) => {
    wake = resolve;
  });
  const clear = clock.setTimer(ms, wake);
  return {
    done,
    cancel() {
      clear();
      wake();
    },
  };
}

/**
 * The cancellation input of public calls. A DOM/React Native `AbortSignal`
 * satisfies it structurally.
 */
export interface CancelSignal {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

/** Runs `onAbort` once if `signal` aborts; returns the detach function. */
export function onAbort(signal: CancelSignal | undefined, onAbort: () => void): () => void {
  if (!signal) return () => {};
  signal.addEventListener('abort', onAbort);
  return () => signal.removeEventListener('abort', onAbort);
}
