import type { AgentStatus } from '../agents';
import type { Clock } from '../hosts/cancellation';

/** The opening Agent's status, as the Console's event stream delivers it. */
export interface AgentStatusUpdate {
  readonly status: AgentStatus | null;
  /** Live updates are flowing (not a snapshot after a drop). */
  readonly liveUpdatesAvailable: boolean;
  /** Which connection the update came over; a new one counts as an exit from Working. */
  readonly connectionGeneration: number;
}

/**
 * Subscribes to the opening Agent's status. The listener may be called synchronously with the
 * current status: the first value is always a baseline and never triggers a refresh.
 */
export type AgentStatusSource = (listener: (update: AgentStatusUpdate) => void) => () => void;

/** The debounce between an exit from Working and the automatic read. */
export const REFRESH_DEBOUNCE_MS = 300;

export interface AutoRefreshHost {
  isReading(): boolean;
  /** True while this store's automatic reads should wait (see `ChangesStore.defersAutomaticRefresh`). */
  defers(): boolean;
  runRefresh(): void;
  changed(): void;
}

/**
 * The status fan-out follows only the opening Agent: an exit from Working (or a reconnect, which
 * may hide whole turns) schedules one read after a short debounce. Other Agents in the same
 * Checkout do not drive freshness.
 */
export class ChangesAutoRefresh {
  status: AgentStatus | null = null;
  /** The loaded snapshot may predate edits still being made. */
  readWasWhileWorking = false;
  readSawWorking = false;
  hasBaseline = false;
  pending = false;
  followers = 0;
  statusGeneration = 0;
  private liveConnection: number | null = null;
  private debounce: unknown = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly source: AgentStatusSource | undefined,
    private readonly clock: Clock,
    private readonly host: AutoRefreshHost,
  ) {}

  get isFollowing(): boolean {
    return this.unsubscribe !== null;
  }

  get isDebouncing(): boolean {
    return this.debounce !== null;
  }

  start(): void {
    if (this.unsubscribe) return;
    this.statusGeneration += 1;
    this.hasBaseline = false;
    this.unsubscribe = this.source?.((update) => this.receive(update)) ?? (() => {});
  }

  stop(): void {
    this.statusGeneration += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.dropPending();
  }

  dropPending(): void {
    this.pending = false;
    if (this.debounce !== null) this.clock.clearTimeout(this.debounce);
    this.debounce = null;
  }

  runPending(isReading: boolean): void {
    if (!this.pending || this.debounce !== null || isReading || this.host.defers()) return;
    this.pending = false;
    this.host.runRefresh();
  }

  private receive(update: AgentStatusUpdate): void {
    const { status } = update;
    const previous = this.status;
    this.status = status;
    // The first live status over a new connection may follow whole turns no connection saw, the
    // drop's own unknown status included: it counts as an exit.
    let reconnected = false;
    if (update.liveUpdatesAvailable) {
      if (this.liveConnection !== null && this.liveConnection !== update.connectionGeneration) {
        reconnected = true;
      }
      this.liveConnection = update.connectionGeneration;
    }
    if (status === 'working') {
      // Once editing starts, the displayed snapshot stays suspect until a read that never
      // overlaps Working succeeds.
      this.readWasWhileWorking = true;
      if (this.host.isReading()) this.readSawWorking = true;
    }
    this.host.changed();
    if (!this.hasBaseline) {
      this.hasBaseline = true;
      return;
    }
    if (!(previous === 'working' || reconnected) || status === null || status === 'working') return;
    this.pending = true;
    if (this.debounce !== null) this.clock.clearTimeout(this.debounce);
    this.debounce = this.clock.setTimeout(() => {
      this.debounce = null;
      this.runPending(this.host.isReading());
    }, REFRESH_DEBOUNCE_MS);
  }
}
