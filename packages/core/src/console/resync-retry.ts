import type { Clock } from '../hosts/cancellation';

/** One pending retry of a failed snapshot: at most one timer, cancelled when the Host moves on. */
export class ResyncRetry {
  private timer: unknown;

  constructor(
    private readonly clock: Clock,
    private readonly delayMs: number,
  ) {}

  /** Runs `run` after the delay unless a retry is already pending or `canRun` says no. */
  schedule(canRun: () => boolean, run: () => void): void {
    if (this.timer !== undefined || !canRun()) return;
    this.timer = this.clock.setTimeout(() => {
      this.timer = undefined;
      if (canRun()) run();
    }, this.delayMs);
  }

  cancel(): void {
    if (this.timer === undefined) return;
    this.clock.clearTimeout(this.timer);
    this.timer = undefined;
  }
}
