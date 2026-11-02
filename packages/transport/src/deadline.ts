import {
  type CancelSignal,
  type Clock,
  createCancellation,
  failures,
  failWith,
} from '@openagentspocket/core';

/**
 * Stops waiting for `work` once `signal` aborts (the work itself cannot be cancelled, but its
 * channel lease must not outlive the deadline). A late failure of the work is dropped.
 */
export function abortable<T>(signal: CancelSignal, work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(failWith(failures.cancelled()));
    if (signal.aborted) {
      work.catch(() => undefined);
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Runs `operation` against a deadline. On expiry the caller gets `timedOut` at once and the
 * operation's signal is aborted; its late result or failure is dropped. An outer `signal`
 * abort rejects with `cancelled` the same way. (Swift `AsyncDeadline`.)
 */
export function withDeadline<T>(
  clock: Clock,
  timeoutMs: number,
  operation: (signal: CancelSignal) => Promise<T>,
  outer?: CancelSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const inner = createCancellation();
    let settled = false;
    let timer: unknown;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clock.clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
      settle();
    };
    const onAbort = () =>
      finish(() => {
        inner.cancel();
        reject(failWith(failures.cancelled()));
      });
    timer = clock.setTimeout(
      () =>
        finish(() => {
          inner.cancel();
          reject(failWith(failures.timedOut()));
        }),
      timeoutMs,
    );
    if (outer?.aborted) {
      onAbort();
      return;
    }
    outer?.addEventListener('abort', onAbort, { once: true });
    operation(inner.signal).then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}
