import type { TransportError } from '../errors/transport-error';
import type { EventsSessionStatus, EventsSessionUpdate } from '../events/types';
import type * as herdr from '../protocol/herdr-types.generated';
import type { HerdrEvent, JsonValue } from '../wire';
import {
  type ConsoleSession,
  type ConsoleTransport,
  decodePane,
  type HostConsoleProjectionOptions,
  type SyncError,
  stringField,
  syncErrorFor,
} from './projection-types';
import { BlockedPromptReader } from './prompt-reader';
import { ResyncRetry } from './resync-retry';
import {
  type ConsoleRow,
  type ConsoleTerminal,
  type ConsoleWorkspace,
  withPaneDirectory,
  withStatus,
} from './row';
import {
  type HostIdentity,
  type ProjectedSnapshot,
  projectSnapshot,
  type Stamped,
} from './snapshot-rows';
import { consoleSubscriptions, isResyncEvent } from './subscriptions';

/**
 * One Host's Console projection: snapshot-then-delta convergence over its `EventsSession`.
 *
 * The snapshot is the truth and events are hints. Every `connected` obliges a snapshot (herdr does
 * not replay events); membership events request a fresh one; status and pane-directory events
 * update rows at once and are re-applied over any snapshot whose request began before them.
 * Leaving `connected` bumps an epoch that discards responses from before it and empties the rows,
 * so a late response never resurrects a dropped Host. One resync runs at a time, with at most one
 * more pending.
 */
export class HostConsoleProjection<T extends ConsoleTransport> {
  readonly host: HostIdentity;
  readonly session: ConsoleSession<T>;

  private agentsByPaneId = new Map<string, ConsoleRow>();
  private lists: Omit<ProjectedSnapshot, 'agents'> = { workspaces: [], terminals: [] };
  private sessionStatus: EventsSessionStatus | undefined;
  private failure: TransportError | undefined;
  private latencyMs: number | undefined;
  private route: string | undefined;
  private syncFailure: SyncError | undefined;
  private generation = 0;
  private revision = 0;
  private awaitingSnapshot = true;

  private readonly onChange: () => void;
  private resyncTask: Promise<void> | undefined;
  private readonly resyncRetry: ResyncRetry;
  private resyncPending = false;
  private snapshotEpoch = 0;
  private paneRevision = 0;
  private statusRevision = 0;
  private paneChanges = new Map<string, Stamped<herdr.PaneInfo>>();
  private statusChanges = new Map<string, Stamped<herdr.AgentStatus>>();
  private readonly prompts: BlockedPromptReader<T>;
  private hasEnded = false;

  constructor(options: HostConsoleProjectionOptions<T>) {
    this.host = options.host;
    this.session = options.session;
    this.resyncRetry = new ResyncRetry(options.clock, options.snapshotRetryMs);
    this.onChange = options.onChange;
    this.prompts = new BlockedPromptReader(options.session, {
      isEnded: () => this.hasEnded,
      isBlocked: (paneId) => this.agentsByPaneId.get(paneId)?.agent.agent_status === 'blocked',
      isListed: (paneId) => this.agentsByPaneId.has(paneId),
      setPrompt: (paneId, prompt) => {
        const row = this.agentsByPaneId.get(paneId);
        if (!row) return;
        this.setRow(paneId, { ...row, lastOutputSnippet: prompt });
        this.publish();
      },
    });
  }

  /** Rows by pane id, in snapshot order. */
  get agentsByPane(): ReadonlyMap<string, ConsoleRow> {
    return this.agentsByPaneId;
  }

  get workspaces(): readonly ConsoleWorkspace[] {
    return this.lists.workspaces;
  }

  get terminals(): readonly ConsoleTerminal[] {
    return this.lists.terminals;
  }

  get status(): EventsSessionStatus | undefined {
    return this.sessionStatus;
  }

  /** The failure that stopped automatic recovery; kept until the next activation resolves. */
  get standingFailure(): TransportError | undefined {
    return this.failure;
  }

  /** The round trip measured on the current connection only. */
  get latency(): number | undefined {
    return this.latencyMs;
  }

  get routeId(): string | undefined {
    return this.route;
  }

  get syncError(): SyncError | undefined {
    return this.syncFailure;
  }

  /** Advances when a Transport is installed; an events resubscribe does not move it. */
  get transportGeneration(): number {
    return this.generation;
  }

  /** Advances with every applied snapshot. */
  get sidebarRevision(): number {
    return this.revision;
  }

  /** Rows from an earlier snapshot, kept while the Host reconnects: nothing is gone until a fresh one says so. */
  get isStale(): boolean {
    return this.awaitingSnapshot && this.agentsByPaneId.size > 0;
  }

  /** An empty projection is "unknown", not "no Agents", until the connection's snapshot lands. */
  get isAwaitingSnapshot(): boolean {
    return this.awaitingSnapshot;
  }

  start(isActive: boolean): void {
    void this.consume(this.session.updates, (update) => this.handle(update));
    // The streams are wake-ups only: the session's current values are ordered against the status
    // updates, a stream payload is not.
    void this.consume(this.session.latencyUpdates, () => {
      this.latencyMs = this.session.currentLatency;
      this.publish();
    });
    void this.consume(this.session.terminalTransportGenerations, (generation) => {
      this.generation = Math.max(this.generation, generation);
      this.publish();
    });
    if (isActive) void this.session.resume();
  }

  /** Re-proves the Host on a foreground return: a failed one restarts, others ping. */
  async revalidate(): Promise<void> {
    if (this.sessionStatus?.kind === 'failed') {
      this.beginNewActivation();
      await this.session.retry();
    } else {
      await this.session.revalidate();
    }
  }

  async retry(): Promise<void> {
    this.beginNewActivation();
    await this.session.retry();
  }

  end(): void {
    if (this.hasEnded) return;
    this.hasEnded = true;
    this.resyncPending = false;
    this.resyncRetry.cancel();
    void this.session.end();
  }

  /**
   * Runs a change on the Host and re-snapshots afterwards; the rows never guess its effect.
   * A failed change leaves the rows untouched.
   */
  async mutate<V>(operation: (transport: T) => Promise<V>): Promise<V> {
    const value = await this.session.withTransport(operation);
    this.scheduleResync();
    return value;
  }

  /** Runs a read or a keypress on the Host's transport without re-snapshotting afterwards. */
  withTransport<V>(operation: (transport: T) => Promise<V>): Promise<V> {
    return this.session.withTransport(operation);
  }

  /** Asks for a fresh snapshot and resolves once no resync is left in flight. */
  async refresh(): Promise<void> {
    this.scheduleResync();
    while (this.resyncTask && !this.hasEnded) await this.resyncTask;
  }

  /** Marks a Done Agent seen on the Host; the next snapshot shows it Idle. */
  async focusAgent(paneId: string, focus: (transport: T) => Promise<void>): Promise<void> {
    const row = this.agentsByPaneId.get(paneId);
    if (this.hasEnded || this.sessionStatus?.kind !== 'connected' || this.awaitingSnapshot) {
      throw new Error('The Host is not ready.');
    }
    if (!row) throw new Error('The Agent is no longer listed.');
    if (row.agent.agent_status !== 'done') return;
    const epoch = this.snapshotEpoch;
    await this.session.withTransport(focus);
    if (!this.hasEnded && this.snapshotEpoch === epoch) this.scheduleResync();
  }

  private async consume<V>(stream: AsyncIterable<V>, handle: (value: V) => void): Promise<void> {
    try {
      for await (const value of stream) {
        if (this.hasEnded) return;
        handle(value);
      }
    } catch {
      // A failing stream ends the session; its status already says so.
    }
  }

  /** The new activation is visible before the session tears the old one down. */
  private beginNewActivation(): void {
    this.sessionStatus = { kind: 'connecting' };
    this.latencyMs = undefined;
    this.route = undefined;
    this.invalidateSnapshot();
    this.publish();
  }

  private handle(update: EventsSessionUpdate): void {
    if (this.hasEnded) return;
    if (update.type === 'status') this.handleStatus(update.status);
    else this.handleEvent(update.event);
  }

  private handleStatus(status: EventsSessionStatus): void {
    this.sessionStatus = status;
    // A latency belongs to the connection that measured it: reading the session's current value
    // pairs it exactly with this status.
    this.latencyMs = this.session.currentLatency;
    this.route = this.session.currentRouteId;
    if (status.kind === 'failed') this.failure = status.failure;
    else if (status.kind === 'connected' || status.kind === 'reconnecting')
      this.failure = undefined;
    if (status.kind === 'connected') {
      // Events keep flowing while the snapshot runs; status revisions outlive an older response.
      this.publish();
      this.scheduleResync();
    } else {
      this.invalidateSnapshot();
      this.publish();
    }
  }

  private handleEvent(event: HerdrEvent): void {
    if (event.kind === 'pane.agent_status_changed') {
      // Deltas keep badges responsive; the snapshot supplies recency and titles, and an unknown
      // status can mean the Agent left its pane.
      if (this.applyStatusChange(event.data) !== undefined) this.scheduleResync();
    } else if (event.kind === 'pane.updated') {
      this.applyPaneChange(event.data);
    } else if (isResyncEvent(event.kind)) {
      this.scheduleResync();
    }
  }

  private scheduleResync(): void {
    if (this.hasEnded || this.sessionStatus?.kind !== 'connected') return;
    if (this.resyncTask) {
      this.resyncPending = true;
      return;
    }
    this.resyncTask = this.runResync().then(() => {
      if (this.hasEnded) return;
      this.resyncTask = undefined;
      if (this.resyncPending) {
        this.resyncPending = false;
        this.scheduleResync();
      }
    });
  }

  private isCurrent(epoch: number): boolean {
    return (
      !this.hasEnded && this.sessionStatus?.kind === 'connected' && this.snapshotEpoch === epoch
    );
  }

  private async runResync(): Promise<void> {
    const epoch = this.snapshotEpoch;
    const statusStart = this.statusRevision;
    const paneStart = this.paneRevision;
    try {
      const snapshot = await this.session.withTransport((transport) => transport.sessionSnapshot());
      if (!this.isCurrent(epoch)) return;
      this.resyncRetry.cancel();
      this.syncFailure = undefined;
      this.apply(snapshot, statusStart, paneStart);
      await this.session.updateSubscriptions(
        consoleSubscriptions(this.agentsByPaneId.keys(), snapshot.protocol),
      );
      this.refreshPrompts();
    } catch (error) {
      if (!this.isCurrent(epoch)) return;
      this.syncFailure = syncErrorFor(error);
      this.publish();
      this.scheduleSnapshotRetry();
    }
  }

  private scheduleSnapshotRetry(): void {
    this.resyncRetry.schedule(
      () => !this.hasEnded && this.sessionStatus?.kind === 'connected',
      () => this.scheduleResync(),
    );
  }

  /** Leaving `connected`: late responses are discarded; the last rows stay (stale) until the next snapshot. */
  private invalidateSnapshot(): void {
    this.snapshotEpoch += 1;
    this.awaitingSnapshot = true;
    this.resyncPending = false;
    this.resyncRetry.cancel();
    this.syncFailure = undefined;
    this.statusChanges.clear();
    this.paneChanges.clear();
    this.prompts.clearPending();
  }

  private apply(snapshot: herdr.SessionSnapshot, statusStart: number, paneStart: number): void {
    this.revision += 1;
    const projected = projectSnapshot({
      host: this.host,
      snapshot,
      previous: this.agentsByPaneId,
      paneChanges: this.paneChanges,
      paneStart,
      statusChanges: this.statusChanges,
      statusStart,
    });
    this.statusChanges.clear();
    this.paneChanges.clear();
    this.awaitingSnapshot = false;
    this.agentsByPaneId = projected.agents;
    this.lists = projected;
    this.publish();
  }

  private applyPaneChange(data: JsonValue): void {
    const pane = decodePane(data);
    if (this.sessionStatus?.kind !== 'connected' || !pane) return;
    this.paneRevision += 1;
    if (this.resyncTask)
      this.paneChanges.set(pane.pane_id, { revision: this.paneRevision, value: pane });
    const row = this.agentsByPaneId.get(pane.pane_id);
    if (!row) return;
    const next = withPaneDirectory(row, pane);
    if (next === row) return;
    this.setRow(pane.pane_id, next);
    this.publish();
  }

  /** The new status when the event named one this projection could read. */
  private applyStatusChange(data: JsonValue): herdr.AgentStatus | undefined {
    const paneId = stringField(data, 'pane_id');
    const status = stringField(data, 'agent_status');
    if (paneId === undefined || status === undefined) return undefined;
    this.statusRevision += 1;
    this.statusChanges.set(paneId, { revision: this.statusRevision, value: status });
    const row = this.agentsByPaneId.get(paneId);
    if (!row) return status;
    const next = withStatus(row, status);
    this.setRow(paneId, status === 'blocked' ? next : { ...next, lastOutputSnippet: undefined });
    this.publish();
    if (status === 'blocked') void this.prompts.refresh(paneId);
    return status;
  }

  private setRow(paneId: string, row: ConsoleRow): void {
    const next = new Map(this.agentsByPaneId);
    next.set(paneId, row);
    this.agentsByPaneId = next;
  }

  private refreshPrompts(): void {
    for (const [paneId, row] of this.agentsByPaneId) {
      if (row.agent.agent_status === 'blocked') void this.prompts.refresh(paneId);
    }
  }

  private publish(): void {
    if (!this.hasEnded) this.onChange();
  }
}
