import type { ConsoleRow } from '../console/row';
import { type Host, hostDisplayName } from '../hosts/host';
import { type ActivityHandle, ActivityRequestError, type ActivityRunState } from './controller';
import { buildContent, desireBlocker, RegistrationWriter } from './coordinator-support';
import {
  type CoordinatorOptions,
  type ReconcileNote,
  SETTLE_MS,
  type Session,
} from './coordinator-types';
import { buildDesire } from './desire';
import { TokenPipes } from './token-pipe';
import type { ActivityDesire } from './types';

export type { CoordinatorOptions, ReconcileNote } from './coordinator-types';
export { SETTLE_MS } from './coordinator-types';

/**
 * The per-Host Live Activity state machine (port of HostLiveActivityCoordinator). The Console's
 * Agent list is the source of truth while the app is foregrounded; after a settle the coordinator
 * starts, updates or ends one activity per Host. Push tokens are written to the Host's
 * registration file so the plugin can keep the activity alive after the app suspends.
 */
export class HostLiveActivityCoordinator {
  private readonly pipes: TokenPipes;
  private readonly latestRows = new Map<string, readonly ConsoleRow[]>();
  private readonly applied = new Map<string, ActivityDesire>();
  private readonly settleTimers = new Map<string, unknown>();
  private readonly sessions = new Map<string, Session>();
  private readonly writer: RegistrationWriter;
  private readonly chains = new Map<string, Promise<void>>();
  private readonly notes = new Map<string, ReconcileNote>();
  private running = false;

  constructor(private readonly o: CoordinatorOptions) {
    this.writer = new RegistrationWriter(o, {
      host: (hostId) => this.host(hostId),
      hostName: (hostId) => this.resolvedHostName(hostId, this.latestRows.get(hostId) ?? []),
      isKnown: (hostId) => this.knownIds().has(hostId),
    });
    this.pipes = new TokenPipes({
      isRunning: () => this.running,
      isKnown: (hostId) => this.knownIds().has(hostId),
      perform: (job, hostId) => this.writer.perform(job, hostId),
      onUnknown: (hostId) => this.dropTransientState(hostId),
    });
  }

  get areActivitiesEnabled(): boolean {
    return this.o.controller.areEnabled;
  }

  note(hostId: string): ReconcileNote | undefined {
    return this.notes.get(hostId);
  }

  isEnabled(hostId: string): boolean {
    return this.o.preferences.isEnabled(hostId);
  }

  /** Resolves when no registration write is in flight. */
  settled(): Promise<void> {
    return this.pipes.settled();
  }

  /** Settings toggle: persist the opt-in and apply now. Off ends the activity and clears the field. */
  setEnabled(enabled: boolean, hostId: string): void {
    this.o.preferences.setEnabled(enabled, hostId);
    this.clearSettle(hostId);
    if (!this.running) return;
    if (enabled) void this.apply(hostId);
    else this.endNow(hostId);
  }

  /** Adopts activities that survived a launch (unknown Hosts end at once), then follows the Agent list. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const known = this.knownIds();
    for (const handle of await this.o.controller.currentActivities()) {
      if (!this.running) return;
      if (!known.has(handle.hostId)) {
        this.o.controller.end(handle.id, null, true);
      } else if (!this.sessions.has(handle.hostId)) {
        this.beginSession(handle, this.o.isAwaitingSnapshot(handle.hostId));
      }
    }
    for (const hostId of this.trackedHosts()) this.scheduleSettle(hostId);
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const hostId of [...this.settleTimers.keys()]) this.clearSettle(hostId);
    for (const session of this.sessions.values()) session.unsubscribe();
    this.sessions.clear();
    this.pipes.clear();
    this.writer.clear();
    this.applied.clear();
    await Promise.all([...this.chains.values()]);
  }

  /** The Console feed. First sight is current truth; newer input restarts the settle. */
  agentsDidChange(rows: readonly ConsoleRow[]): void {
    const known = this.knownIds();
    const grouped = new Map<string, ConsoleRow[]>();
    for (const row of rows) {
      if (!known.has(row.hostId)) continue; // a removed Host's lingering rows must not revive it
      grouped.set(row.hostId, [...(grouped.get(row.hostId) ?? []), row]);
    }
    const hosts = new Set([...this.latestRows.keys(), ...grouped.keys(), ...this.sessions.keys()]);
    this.latestRows.clear();
    for (const [hostId, hostRows] of grouped) this.latestRows.set(hostId, hostRows);
    if (!this.running) return;
    for (const hostId of hosts) this.scheduleSettle(hostId);
  }

  /** An explicitly removed Host: ends its activity, forgets its opt-in, drops what is queued for it. */
  async forgetHost(hostId: string): Promise<void> {
    this.o.preferences.setEnabled(false, hostId);
    const ids = new Set(
      (await this.o.controller.currentActivities())
        .filter((handle) => handle.hostId === hostId)
        .map((handle) => handle.id),
    );
    const session = this.sessions.get(hostId);
    if (session) ids.add(session.id);
    this.dropSession(hostId, false);
    for (const id of [...ids].sort()) this.o.controller.end(id, null, true);
    this.dropTransientState(hostId);
  }

  /** Foreground return: notice dismissals, adopt or orphan what ActivityKit holds, retry dirty writes. */
  async reconcile(): Promise<void> {
    if (!this.running) return;
    const known = this.knownIds();
    const current = await this.o.controller.currentActivities();
    if (!this.running) return;
    const liveIds = new Set(current.map((handle) => handle.id));
    for (const handle of current) {
      if (known.has(handle.hostId)) continue;
      this.o.controller.end(handle.id, null, true);
      if (this.sessions.get(handle.hostId)?.id === handle.id)
        this.dropSession(handle.hostId, false);
    }
    for (const [hostId, session] of [...this.sessions]) {
      if (liveIds.has(session.id)) continue;
      this.dropSession(hostId, false);
      this.pipes.enqueue({ kind: 'clear' }, hostId);
    }
    const tracked = new Set([
      ...this.pipes.hostIds(),
      ...this.settleTimers.keys(),
      ...this.applied.keys(),
      ...this.latestRows.keys(),
      ...this.writer.hostIds(),
      ...this.notes.keys(),
    ]);
    for (const hostId of tracked) if (!known.has(hostId)) this.dropTransientState(hostId);
    for (const handle of current) {
      if (known.has(handle.hostId) && !this.sessions.has(handle.hostId)) {
        this.beginSession(handle, this.o.isAwaitingSnapshot(handle.hostId));
      }
    }
    this.pipes.retryDirty(null);
    this.releaseSnapshotHolds();
  }

  /** Connection or snapshot-hold change: retry writes for reachable Hosts and hold unknown inventories. */
  connectionsDidChange(): void {
    if (!this.running) return;
    this.pipes.retryDirty((hostId) => this.o.connectionStatus(hostId)?.kind === 'connected');
    for (const hostId of this.sessions.keys()) this.holdIfUnknown(hostId);
    this.releaseSnapshotHolds();
  }

  /** Pin change: rebuild through the settle, and push the pins to connected Hosts showing an activity. */
  pinsDidChange(): void {
    if (!this.running) return;
    for (const hostId of this.trackedHosts()) {
      this.scheduleSettle(hostId);
      if (this.sessions.has(hostId) && this.o.connectionStatus(hostId)?.kind === 'connected') {
        this.pipes.enqueue({ kind: 'setPreferences' }, hostId);
      }
    }
  }

  /** A read of the Host's approval asks changed them: rebuild through the settle; nothing is written. */
  approvalAsksDidChange(hostId: string): void {
    if (this.running) this.scheduleSettle(hostId);
  }

  // MARK: desire / settle

  private knownIds(): Set<string> {
    return new Set(this.o.hosts().map((host) => host.id));
  }

  private host(hostId: string): Host | undefined {
    return this.o.hosts().find((host) => host.id === hostId);
  }

  private trackedHosts(): Set<string> {
    return new Set([...this.latestRows.keys(), ...this.sessions.keys()]);
  }

  private clearSettle(hostId: string): void {
    const timer = this.settleTimers.get(hostId);
    if (timer === undefined) return;
    this.o.clock.clearTimeout(timer);
    this.settleTimers.delete(hostId);
  }

  private scheduleSettle(hostId: string): void {
    this.clearSettle(hostId);
    if (!this.knownIds().has(hostId)) return;
    this.holdIfUnknown(hostId);
    if (this.shouldDeferApply(hostId)) return;
    if (this.isUnchanged(hostId, this.computeDesired(hostId))) return;
    this.settleTimers.set(
      hostId,
      this.o.clock.setTimeout(() => {
        this.settleTimers.delete(hostId);
        void this.apply(hostId);
      }, this.o.settleMs ?? SETTLE_MS),
    );
  }

  /** Applies serialize per Host; each recomputes the desire, so queued ones coalesce. */
  private apply(hostId: string): Promise<void> {
    const next = (this.chains.get(hostId) ?? Promise.resolve()).then(() => this.applyNow(hostId));
    this.chains.set(
      hostId,
      next.catch(() => undefined),
    );
    return next;
  }

  private async applyNow(hostId: string): Promise<void> {
    if (!this.running || !this.knownIds().has(hostId)) return;
    this.holdIfUnknown(hostId);
    if (this.shouldDeferApply(hostId)) return;
    const desired = this.computeDesired(hostId);
    if (this.isUnchanged(hostId, desired)) return;
    if (!desired) {
      this.setNote(hostId, {
        kind: 'idle',
        reason: desireBlocker(this.o, hostId, this.notificationKey(hostId) !== null),
      });
      this.endNow(hostId);
      return;
    }
    const key = this.notificationKey(hostId);
    const content = key
      ? await buildContent(this.o, desired, hostId, key, this.sessions.get(hostId)?.id)
      : null;
    if (!content || !this.running) {
      if (this.running) this.setNote(hostId, { kind: 'sealFailed' });
      return;
    }
    const session = this.sessions.get(hostId);
    if (session) {
      this.o.controller.update(session.id, content);
      this.applied.set(hostId, desired);
      this.setNote(hostId, { kind: 'updated' });
      return;
    }
    if (!this.o.controller.areEnabled) {
      this.setNote(hostId, { kind: 'idle', reason: 'activitiesDisabled' });
      return;
    }
    try {
      const handle = await this.o.controller.request(hostId, content);
      if (!this.running || this.sessions.has(hostId)) {
        this.o.controller.end(handle.id, null, true);
        return;
      }
      this.beginSession(handle, false);
      this.applied.set(hostId, desired);
      this.setNote(hostId, { kind: 'started' });
    } catch (thrown) {
      // Stay idle: a later change, reconnect or foreground reconcile is the retry.
      const reason = thrown instanceof ActivityRequestError ? thrown.reason : String(thrown);
      this.setNote(hostId, { kind: 'startFailed', reason });
    }
  }

  private computeDesired(hostId: string): ActivityDesire | null {
    if (!this.o.controller.areEnabled || !this.o.preferences.isEnabled(hostId)) return null;
    if (!this.o.deviceToken() || !this.notificationKey(hostId)) return null;
    const rows = this.latestRows.get(hostId) ?? [];
    return buildDesire({
      rows,
      hostName: this.resolvedHostName(hostId, rows),
      pinnedPaneIds: this.o.pinnedPaneIds?.(hostId),
      asks: this.o.approvalAsks?.(hostId),
    });
  }

  private isUnchanged(hostId: string, desired: ActivityDesire | null): boolean {
    const applied = this.applied.get(hostId);
    if (!desired) return applied === undefined && !this.sessions.has(hostId);
    return JSON.stringify(applied) === JSON.stringify(desired);
  }

  /** True while the Host's Agent list is unknown: an empty slice is loading, not all-idle. */
  private shouldDeferApply(hostId: string): boolean {
    return (
      this.isUnknownInventory(hostId) || this.sessions.get(hostId)?.awaitingFirstSnapshot === true
    );
  }

  private isUnknownInventory(hostId: string): boolean {
    if (this.o.isAwaitingSnapshot(hostId)) return true;
    const status = this.o.connectionStatus(hostId);
    return this.sessions.has(hostId) && status !== undefined && status.kind !== 'connected';
  }

  private holdIfUnknown(hostId: string): void {
    const session = this.sessions.get(hostId);
    if (session && this.isUnknownInventory(hostId)) session.awaitingFirstSnapshot = true;
  }

  private releaseSnapshotHolds(): void {
    for (const [hostId, session] of this.sessions) {
      if (!session.awaitingFirstSnapshot || this.isUnknownInventory(hostId)) continue;
      session.awaitingFirstSnapshot = false;
      this.scheduleSettle(hostId);
    }
  }

  private resolvedHostName(hostId: string, rows: readonly ConsoleRow[]): string {
    const host = this.host(hostId);
    return (host && hostDisplayName(host)) || (rows[0]?.hostName ?? '');
  }

  private notificationKey(hostId: string): Uint8Array | null {
    const key = this.o.keys.record(hostId)?.key;
    return key?.length === 32 ? key : null;
  }

  private setNote(hostId: string, note: ReconcileNote): void {
    this.notes.set(hostId, note);
    this.o.onChange?.();
  }

  // MARK: sessions

  private beginSession(handle: ActivityHandle, awaitingFirstSnapshot: boolean): void {
    const session: Session = { id: handle.id, awaitingFirstSnapshot, unsubscribe: () => undefined };
    this.sessions.set(handle.hostId, session);
    const offToken = this.o.controller.onPushToken(handle, (hex) =>
      this.considerToken(hex, handle.hostId, session),
    );
    const offState = this.o.controller.onState(handle, (state) =>
      this.considerState(state, handle.hostId, session),
    );
    session.unsubscribe = () => {
      offToken();
      offState();
    };
  }

  private considerToken(hex: string, hostId: string, session: Session): void {
    if (hex === '' || this.sessions.get(hostId) !== session) return;
    this.pipes.enqueue({ kind: 'set', hex, startedAt: (this.o.now ?? Date.now)() }, hostId);
  }

  private considerState(state: ActivityRunState, hostId: string, session: Session): void {
    if (state !== 'dismissed' && state !== 'ended') return;
    if (this.sessions.get(hostId) !== session) return;
    this.dropSession(hostId, false);
    this.pipes.enqueue({ kind: 'clear' }, hostId);
  }

  private endNow(hostId: string): void {
    this.dropSession(hostId, true);
    this.pipes.enqueue({ kind: 'clear' }, hostId);
    this.applied.delete(hostId);
  }

  private dropSession(hostId: string, endOnController: boolean): void {
    const session = this.sessions.get(hostId);
    if (!session) return;
    this.sessions.delete(hostId);
    session.unsubscribe();
    if (endOnController) this.o.controller.end(session.id, null, true);
  }

  /** Everything held for a Host other than its session; the persisted opt-in is `forgetHost`'s alone. */
  private dropTransientState(hostId: string): void {
    this.clearSettle(hostId);
    this.pipes.drop(hostId);
    this.writer.forget(hostId);
    this.applied.delete(hostId);
    this.latestRows.delete(hostId);
    this.notes.delete(hostId);
  }
}
