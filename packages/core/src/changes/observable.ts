import { CancelledError, type CancelSignal } from '../hosts/cancellation';

/** A minimal external store: `useSyncExternalStore(store.subscribe, store.getState)` reads it. */
export class Observable<State> {
  private listeners = new Set<() => void>();

  constructor(private state: State) {}

  readonly getState = (): State => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  protected set(next: Partial<State>): void {
    this.state = { ...this.state, ...next };
    for (const listener of [...this.listeners]) listener();
  }
}

/**
 * One git exec at a time for a Host, including lazy patch and directory reads. Cancelling a
 * waiter removes it from the queue; the owner releases only when its call returns, even when a
 * remote process may still be draining.
 */
export class ExecGate {
  private occupied = false;
  private readonly waiters: { resume: () => void; reject: (error: Error) => void }[] = [];

  async run<T>(operation: () => Promise<T>, signal?: CancelSignal): Promise<T> {
    await this.acquire(signal);
    try {
      if (signal?.aborted) throw new CancelledError();
      return await operation();
    } finally {
      this.release();
    }
  }

  private acquire(signal?: CancelSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(new CancelledError());
    if (!this.occupied) {
      this.occupied = true;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const waiter = {
        resume: () => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        },
        reject,
      };
      const onAbort = () => {
        const position = this.waiters.indexOf(waiter);
        if (position >= 0) {
          this.waiters.splice(position, 1);
          reject(new CancelledError());
        }
      };
      this.waiters.push(waiter);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) next.resume();
    else this.occupied = false;
  }
}

/** Runs `operation` under the gate when there is one. */
export function gated<Request, Response>(
  gate: ExecGate | undefined,
  operation: (request: Request, signal: CancelSignal) => Promise<Response>,
): (request: Request, signal: CancelSignal) => Promise<Response> {
  return gate ? (request, signal) => gate.run(() => operation(request, signal), signal) : operation;
}
