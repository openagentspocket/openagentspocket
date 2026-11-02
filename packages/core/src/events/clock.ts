import type { CancelSignal, Clock } from '../hosts/cancellation';

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
  const handle = clock.setTimeout(wake, ms);
  return {
    done,
    cancel() {
      clock.clearTimeout(handle);
      wake();
    },
  };
}

/** Runs `onAbort` once if `signal` aborts; returns the detach function. */
export function onAbort(signal: CancelSignal | undefined, onAbort: () => void): () => void {
  if (!signal) return () => {};
  signal.addEventListener('abort', onAbort);
  return () => signal.removeEventListener('abort', onAbort);
}
