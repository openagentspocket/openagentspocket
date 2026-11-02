import { CancelledError, type CancelSignal } from '../hosts/cancellation';

export function throwIfAborted(signal: CancelSignal | undefined): void {
  if (signal?.aborted) throw new CancelledError();
}

/**
 * Settles with `promise`, or rejects with `CancelledError` as soon as `signal` aborts. The work
 * behind `promise` is not stopped: a cancelled waiter returns at once while the queue it joined
 * keeps its order (Swift: AsyncStream-woken waiter in `waitForAdmission`).
 */
export function raceAbort<T>(promise: Promise<T>, signal: CancelSignal | undefined): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    promise.catch(() => undefined);
    return Promise.reject(new CancelledError());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new CancelledError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}
