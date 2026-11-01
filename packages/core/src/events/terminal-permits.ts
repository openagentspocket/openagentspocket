import { type CancelSignal, onAbort } from './clock';
import { failures, failWith } from './failure';
import { TERMINAL_LIMIT } from './policies';

/** Identifies one terminal surface; `null` is a legacy Host-wide exclusive caller. */
export type TerminalTarget = string | null;

interface PermitWaiter {
  readonly target: TerminalTarget;
  resolve(): void;
  reject(error: unknown): void;
  detach(): void;
}

/**
 * Terminal admission for one Host: each target has one owner at a time, at
 * most `TERMINAL_LIMIT` live PTYs, and a `null` target excludes everyone. A
 * permit spans the operation and its explicit channel teardown; as permits
 * free up, waiters are admitted in arrival order among those that fit.
 */
export class TerminalPermits {
  private readonly inUse = new Set<TerminalTarget>();
  private waiters: PermitWaiter[] = [];
  private idleWaiters: (() => void)[] = [];

  constructor(private readonly limit = TERMINAL_LIMIT) {}

  get activeCount(): number {
    return this.inUse.size;
  }

  acquire(target: TerminalTarget, signal?: CancelSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(failWith(failures.cancelled()));
    if (this.canAcquire(target)) {
      this.inUse.add(target);
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const waiter: PermitWaiter = {
        target,
        resolve,
        reject,
        detach: onAbort(signal, () => {
          this.waiters = this.waiters.filter((entry) => entry !== waiter);
          reject(failWith(failures.cancelled()));
        }),
      };
      this.waiters.push(waiter);
    });
  }

  release(target: TerminalTarget): void {
    this.inUse.delete(target);
    for (let index = 0; index < this.waiters.length; ) {
      const waiter = this.waiters[index] as PermitWaiter;
      if (!this.canAcquire(waiter.target)) {
        index += 1;
        continue;
      }
      this.waiters.splice(index, 1);
      waiter.detach();
      this.inUse.add(waiter.target);
      waiter.resolve();
    }
    if (this.inUse.size > 0) return;
    const idle = this.idleWaiters;
    this.idleWaiters = [];
    for (const resume of idle) resume();
  }

  /** Resolves once no permit is held. */
  waitForIdle(): Promise<void> {
    if (this.inUse.size === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private canAcquire(target: TerminalTarget): boolean {
    if (this.inUse.size >= this.limit || this.inUse.has(target)) return false;
    return target === null ? this.inUse.size === 0 : !this.inUse.has(null);
  }
}
