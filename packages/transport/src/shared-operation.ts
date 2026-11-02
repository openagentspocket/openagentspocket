import { CancelledError, type CancelSignal } from '@openagentspocket/core';

/**
 * A single-flight async operation whose waiters can leave early (deadline, cancellation)
 * without cancelling the operation itself: a remote command that ignores EOF cannot be ended
 * client-side anyway, so callers abandon the wait and the run finishes on its own.
 * A failure reaches every current waiter and is not cached; a success is memoized only when
 * `cachesSuccess`. (Swift `SharedAsyncOperation`.)
 */
export class SharedOperation<T> {
  private cached: { value: T } | undefined;
  private running: Promise<T> | undefined;

  constructor(private readonly cachesSuccess: boolean) {}

  get isRunning(): boolean {
    return this.running !== undefined;
  }

  value(start: () => Promise<T>, signal?: CancelSignal): Promise<T> {
    if (this.cached) return Promise.resolve(this.cached.value);
    if (signal?.aborted) return Promise.reject(new CancelledError());
    if (!this.running) {
      const run = start().then(
        (value) => {
          this.running = undefined;
          if (this.cachesSuccess) this.cached = { value };
          return value;
        },
        (error: unknown) => {
          this.running = undefined;
          throw error;
        },
      );
      // The run outlives abandoned waiters; its failure is theirs, never unhandled.
      run.catch(() => {});
      this.running = run;
    }
    const running = this.running;
    if (!signal) return running;
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(new CancelledError());
      signal.addEventListener('abort', onAbort, { once: true });
      running.then(
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
}
