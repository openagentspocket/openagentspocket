import { CancelledError, type CancelSignal } from '@openagentspocket/core';

export type ChannelClass =
  | 'ordinaryForwarding'
  | 'events'
  | 'ordinarySession'
  | 'attach'
  | 'preview';

export type ChannelCounts = Readonly<Record<ChannelClass, number>> & {
  readonly connection: number;
};

export type ChannelLimits = ChannelCounts;

/**
 * Production budgets: sessions (exec, PTY, SFTP) stay under sshd's default MaxSessions of 10;
 * the connection ceiling restates the sum (8+1+4+5+6) and only guards a future class.
 */
export const PRODUCTION_LIMITS: ChannelLimits = {
  ordinaryForwarding: 8,
  events: 1,
  ordinarySession: 4,
  attach: 5,
  preview: 6,
  connection: 24,
};

export interface ChannelLease {
  /** Idempotent. */
  release(): void;
}

interface Waiter {
  readonly channelClass: ChannelClass;
  grant(): void;
  reject(error: unknown): void;
}

/**
 * Separates forwarding and session admission and enforces one ceiling over every live channel
 * on a Host connection. A released slot goes to the first waiter whose class has room.
 * (Swift `SSHChannelAdmission`.)
 */
export class ChannelAdmission {
  private counts: Record<ChannelClass, number> & { connection: number } = {
    ordinaryForwarding: 0,
    events: 0,
    ordinarySession: 0,
    attach: 0,
    preview: 0,
    connection: 0,
  };
  private readonly waiters: Waiter[] = [];

  constructor(private readonly limits: ChannelLimits = PRODUCTION_LIMITS) {}

  snapshot(): ChannelCounts {
    return { ...this.counts };
  }

  acquire(channelClass: ChannelClass, signal?: CancelSignal): Promise<ChannelLease> {
    if (signal?.aborted) return Promise.reject(new CancelledError());
    if (this.canAcquire(channelClass)) return Promise.resolve(this.take(channelClass));
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        const index = this.waiters.indexOf(waiter);
        if (index < 0) return;
        this.waiters.splice(index, 1);
        reject(new CancelledError());
      };
      const waiter: Waiter = {
        channelClass,
        grant: () => {
          signal?.removeEventListener('abort', onAbort);
          resolve(this.take(channelClass));
        },
        reject,
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.waiters.push(waiter);
    });
  }

  async withChannel<T>(
    channelClass: ChannelClass,
    operation: () => Promise<T>,
    signal?: CancelSignal,
  ): Promise<T> {
    const lease = await this.acquire(channelClass, signal);
    try {
      return await operation();
    } finally {
      lease.release();
    }
  }

  /** Fails every parked waiter (the connection is gone). */
  rejectWaiters(error: unknown): void {
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }

  private canAcquire(channelClass: ChannelClass): boolean {
    return (
      this.counts.connection < this.limits.connection &&
      this.counts[channelClass] < this.limits[channelClass]
    );
  }

  private take(channelClass: ChannelClass): ChannelLease {
    this.counts[channelClass] += 1;
    this.counts.connection += 1;
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        this.counts[channelClass] -= 1;
        this.counts.connection -= 1;
        this.resumeEligible();
      },
    };
  }

  private resumeEligible(): void {
    for (;;) {
      const index = this.waiters.findIndex((waiter) => this.canAcquire(waiter.channelClass));
      if (index < 0) return;
      const [waiter] = this.waiters.splice(index, 1);
      waiter?.grant();
    }
  }
}
