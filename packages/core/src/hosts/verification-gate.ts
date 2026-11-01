import { CancelledError, type CancelSignal } from './cancellation';

interface Waiter {
  grant(): void;
}

/**
 * Serializes host-key verification across one connect's routes, so two routes
 * never ask the user to confirm a key at once, and a route that arrives second
 * sees the trust the first one just stored instead of prompting again. A
 * cancelled waiter leaves the queue at once.
 */
export class HostKeyVerificationGate {
  private held = false;
  private readonly waiters: Waiter[] = [];

  async withLock<T>(body: () => Promise<T>, signal?: CancelSignal): Promise<T> {
    await this.acquire(signal);
    try {
      return await body();
    } finally {
      this.release();
    }
  }

  private acquire(signal?: CancelSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(new CancelledError());
    if (!this.held) {
      this.held = true;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        const index = this.waiters.indexOf(waiter);
        if (index < 0) return;
        this.waiters.splice(index, 1);
        reject(new CancelledError());
      };
      const waiter: Waiter = {
        grant: () => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        },
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.waiters.push(waiter);
    });
  }

  /** The lock passes straight to the next waiter. */
  private release(): void {
    const next = this.waiters.shift();
    if (next) next.grant();
    else this.held = false;
  }
}
