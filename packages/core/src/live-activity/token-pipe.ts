/** A registration-file write the coordinator owes a Host. */
export type TokenJob =
  | { readonly kind: 'set'; readonly hex: string; readonly startedAt: number }
  | { readonly kind: 'setPreferences' }
  | { readonly kind: 'clear' };

interface Pipe {
  pending?: TokenJob;
  inFlight: boolean;
  dirty: boolean;
}

export interface TokenPipesOptions {
  readonly isRunning: () => boolean;
  readonly isKnown: (hostId: string) => boolean;
  /** Does the write; true when it landed. Must not throw. */
  readonly perform: (job: TokenJob, hostId: string) => Promise<boolean>;
  /** A Host left the catalog while its write was in flight: nothing of it may stay. */
  readonly onUnknown: (hostId: string) => void;
}

/**
 * One write at a time per Host, coalescing newer jobs over an older pending one. A failed write
 * stays queued and dirty: it waits for a reconnect or a foreground reconcile instead of spinning.
 */
export class TokenPipes {
  private readonly pipes = new Map<string, Pipe>();
  private readonly running = new Set<Promise<void>>();
  private epoch = 0;

  constructor(private readonly options: TokenPipesOptions) {}

  has(hostId: string): boolean {
    return this.pipes.has(hostId);
  }

  hostIds(): string[] {
    return [...this.pipes.keys()];
  }

  enqueue(job: TokenJob, hostId: string): void {
    if (!this.options.isRunning() || !this.options.isKnown(hostId)) return;
    const pipe = this.pipes.get(hostId) ?? { inFlight: false, dirty: false };
    const keeps = pipe.pending?.kind === 'set' || pipe.pending?.kind === 'clear';
    // A pending token write already carries the current pins; a pending clear drops the field.
    if (!(keeps && job.kind === 'setPreferences')) pipe.pending = job;
    this.pipes.set(hostId, pipe);
    this.pump(hostId);
  }

  retryDirty(isConnected: ((hostId: string) => boolean) | null): void {
    for (const [hostId, pipe] of [...this.pipes]) {
      if (!pipe.dirty) continue;
      if (!this.options.isKnown(hostId)) {
        this.pipes.delete(hostId);
        continue;
      }
      if (isConnected && !isConnected(hostId)) continue;
      this.pump(hostId);
    }
  }

  drop(hostId: string): void {
    this.pipes.delete(hostId);
  }

  /** Forgets every pipe; writes in flight finish unobserved. */
  clear(): void {
    this.epoch += 1;
    this.pipes.clear();
  }

  /** Resolves when no write is in flight (tests and shutdown). */
  async settled(): Promise<void> {
    while (this.running.size > 0) await Promise.all([...this.running]);
  }

  private pump(hostId: string): void {
    const pipe = this.pipes.get(hostId);
    if (!this.options.isRunning() || !pipe || pipe.inFlight || !pipe.pending) return;
    const job = pipe.pending;
    pipe.pending = undefined;
    pipe.inFlight = true;
    const epoch = this.epoch;
    const run = this.options.perform(job, hostId).then((succeeded) => {
      if (epoch !== this.epoch || !this.options.isRunning()) return;
      if (!this.options.isKnown(hostId)) {
        this.options.onUnknown(hostId);
        return;
      }
      const current = this.pipes.get(hostId) ?? { inFlight: false, dirty: false };
      current.inFlight = false;
      const newer = current.pending;
      current.dirty = !succeeded;
      if (!succeeded && !newer) current.pending = job;
      this.pipes.set(hostId, current);
      if (succeeded || newer) this.pump(hostId);
    });
    const tracked = run.finally(() => this.running.delete(tracked));
    this.running.add(tracked);
  }
}
