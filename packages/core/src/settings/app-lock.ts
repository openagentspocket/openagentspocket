import type { GracePeriod } from './preferences';

export const GRACE_SECONDS: Record<GracePeriod, number> = {
  immediately: 0,
  oneMinute: 60,
  fiveMinutes: 5 * 60,
  fifteenMinutes: 15 * 60,
};

/** Whether returning after `leftAtMs` locks. Time running backwards locks too. */
export function locksOnReturn(grace: GracePeriod, leftAtMs: number, nowMs: number): boolean {
  const away = nowMs - leftAtMs;
  return away < 0 || away >= GRACE_SECONDS[grace] * 1000;
}

/**
 * The app lock's state: locked at launch when on, covered whenever the app is not active, and
 * locked again on return after the grace period. Pure: the caller feeds app-state changes and
 * the clock, and shows the cover while `covered` and the unlock prompt while `locked`.
 */
export class AppLockGate {
  locked: boolean;
  covered = false;
  private leftAt: number | null = null;

  constructor(
    private enabled: boolean,
    private grace: GracePeriod,
  ) {
    this.locked = enabled;
  }

  configure(enabled: boolean, grace: GracePeriod): void {
    this.enabled = enabled;
    this.grace = grace;
    if (!enabled) {
      this.locked = false;
      this.covered = false;
      this.leftAt = null;
    }
  }

  /** The app left the foreground (inactive or background). */
  deactivate(nowMs: number): void {
    if (!this.enabled) return;
    this.covered = true;
    this.leftAt ??= nowMs;
  }

  /** The app is active again. */
  activate(nowMs: number): void {
    if (!this.enabled) return;
    if (this.leftAt !== null && locksOnReturn(this.grace, this.leftAt, nowMs)) this.locked = true;
    this.leftAt = null;
    this.covered = false;
  }

  unlock(): void {
    this.locked = false;
  }
}
