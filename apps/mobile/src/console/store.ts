import {
  type AgentContextUsage,
  type AgentPanelSort,
  type AgentStatusClocks,
  agentKey,
  type CancelSignal,
  type Clock,
  type ConsoleRow,
  type ConsoleSession,
  type ConsoleTerminal,
  type ConsoleTransport,
  type ConsoleWorkspace,
  type EventsSessionStatus,
  HostConsoleProjection,
  type HostIdentity,
  type HostLink,
  hostLink,
  ListPreferences,
  type PinnedAgents,
  type RowChangeTotals,
  rowKey,
  type SyncError,
  selectConsole,
  TransportFailure,
} from '@openagentspocket/core';

/** One Host as the lists and banners see it. */
export interface HostSummary {
  readonly id: string;
  readonly name: string;
  readonly status: EventsSessionStatus | undefined;
  readonly isAwaitingSnapshot: boolean;
  /** Its rows are from an earlier snapshot, kept while the Host reconnects (see `HostConsoleProjection.isStale`). */
  readonly isStale?: boolean;
  /** How the link reads to a person (see `hostLink`): last known good while it resumes. */
  readonly link: HostLink;
  readonly syncError: SyncError | undefined;
  readonly latencyMs: number | undefined;
  /** The route the live connection uses; undefined until one connected. */
  readonly routeId?: string | undefined;
}

/** An immutable view of the whole Console; replaced (never mutated) on every change. */
export interface ConsoleState {
  readonly rows: readonly ConsoleRow[];
  readonly hosts: readonly HostSummary[];
  readonly readyHosts: ReadonlySet<string>;
  /** Advances with every recompute, so a view can tell its inputs are stale. */
  readonly revision: number;
}

export interface ConsoleStoreOptions {
  readonly pins: PinnedAgents;
  /** Persisted Agents list choices; memory-backed when omitted. */
  readonly listPrefs?: ListPreferences;
  readonly clocks: AgentStatusClocks;
  readonly clock: Clock;
  readonly snapshotRetryMs?: number;
  readonly sortByHost?: ReadonlyMap<string, AgentPanelSort>;
}

const DEFAULT_RETRY_MS = 5000;

/**
 * Every Host's `HostConsoleProjection` behind one subscribable state. The projections own
 * convergence; the store joins their rows in Console order and relays actions to the right Host.
 * `T` is the Transport the Hosts' sessions hand out (the live one arrives behind the same
 * `ConsoleTransport` interface).
 */
export class ConsoleStore<T extends ConsoleTransport = ConsoleTransport> {
  private readonly projections = new Map<string, HostConsoleProjection<T>>();
  private readonly listeners = new Set<() => void>();
  /** Hosts that have been connected at least once this run: their last known good state stands. */
  private readonly connectedOnce = new Set<string>();
  private readonly extras = new Map<
    string,
    { changeTotals?: RowChangeTotals; contextUsage?: AgentContextUsage }
  >();
  private state: ConsoleState = {
    rows: [],
    hosts: [],
    readyHosts: new Set(),
    revision: 0,
  };

  /** The Agents list presentation, Host filter and folds, persisted with the device storage. */
  readonly listPrefs: ListPreferences;

  constructor(private readonly options: ConsoleStoreOptions) {
    this.listPrefs = options.listPrefs ?? new ListPreferences();
  }

  readonly getState = (): ConsoleState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Starts a Host's projection; an active one connects at once. */
  addHost(host: HostIdentity, session: ConsoleSession<T>, isActive = true): void {
    if (this.projections.has(host.id)) throw new Error(`Host ${host.id} is already added.`);
    const projection = new HostConsoleProjection<T>({
      host,
      session,
      clock: this.options.clock,
      snapshotRetryMs: this.options.snapshotRetryMs ?? DEFAULT_RETRY_MS,
      onChange: () => this.recompute(),
    });
    this.projections.set(host.id, projection);
    projection.start(isActive);
    this.recompute();
  }

  removeHost(hostId: string): void {
    const projection = this.projections.get(hostId);
    if (!projection) return;
    this.projections.delete(hostId);
    this.connectedOnce.delete(hostId);
    this.options.clocks.retainHosts(new Set(this.projections.keys()));
    this.recompute();
    projection.end();
  }

  /** The workspaces a Host's latest snapshot reports, in sidebar order; empty for an unknown Host. */
  workspaces(hostId: string): readonly ConsoleWorkspace[] {
    return this.projections.get(hostId)?.workspaces ?? [];
  }

  /** The shell panes (no Agent) of one Host's latest snapshot, or of every Host in order. */
  terminals(hostId?: string): readonly ConsoleTerminal[] {
    if (hostId !== undefined) return this.projections.get(hostId)?.terminals ?? [];
    return [...this.projections.values()].flatMap((projection) => projection.terminals);
  }

  isPinned(hostId: string, paneId: string): boolean {
    return this.options.pins.isPinned(hostId, paneId);
  }

  /** A Host's pinned panes, most recently pinned first. */
  pinnedPaneIds(hostId: string): string[] {
    return this.options.pins.pinnedPaneIds(hostId);
  }

  togglePin(hostId: string, paneId: string): void {
    this.options.pins.togglePin(hostId, paneId);
    this.recompute();
  }

  /** Moves a pinned Agent one place toward the front or back of the pins (skipping closed panes). */
  movePin(hostId: string, paneId: string, direction: 'up' | 'down'): void {
    const listed = new Set(this.state.rows.map((row) => `${row.hostId}\u0000${row.agent.pane_id}`));
    const moved = this.options.pins.movePin(hostId, paneId, direction, (host, pane) =>
      listed.has(`${host}\u0000${pane}`),
    );
    if (moved) this.recompute();
  }

  /** Drops a pinned Agent onto the place another pinned Agent holds (the board's drag). */
  movePinTo(hostId: string, paneId: string, target: { hostId: string; paneId: string }): void {
    if (this.options.pins.movePinTo(hostId, paneId, target)) this.recompute();
  }

  /** Clears an Agent from the Status Inbox. */
  dismiss(key: string): void {
    this.options.clocks.dismiss(key);
    this.recompute();
  }

  /** The age stamp of an Agent key, for the Status Inbox. */
  stamp(key: string): ReturnType<AgentStatusClocks['stamp']> {
    return this.options.clocks.stamp(key);
  }

  /** Runs a change on a Host (close, rename, ...) and re-snapshots afterwards. */
  mutate<V>(hostId: string, operation: (transport: T) => Promise<V>): Promise<V> {
    return this.projection(hostId).mutate(operation);
  }

  /** Runs a call on a Host's transport with no re-snapshot (a pane read, a keypress). */
  withTransport<V>(hostId: string, operation: (transport: T) => Promise<V>): Promise<V> {
    return this.projection(hostId).withTransport(operation);
  }

  /**
   * One terminal lifetime on the Host's Transport, admitted per `target`. Rejects with a
   * `TransportFailure` when the Host cannot carry a terminal.
   */
  withTerminalTransport<V>(
    hostId: string,
    operation: (transport: T, transportGeneration: number) => Promise<V>,
    options: { target?: string | null; signal?: CancelSignal } = {},
  ): Promise<V> {
    const { session } = this.projection(hostId);
    if (!session.withTerminalTransport) {
      return Promise.reject(
        new TransportFailure({ kind: 'sshUnreachable', detail: 'No terminal channel.' }),
      );
    }
    return session.withTerminalTransport(operation, options);
  }

  /** The newest ping-proven Transport generation the Host reported; 0 before the first. */
  transportGeneration(hostId: string): number {
    return this.projections.get(hostId)?.transportGeneration ?? 0;
  }

  /** Marks a Done Agent seen on its Host. */
  focusAgent(
    hostId: string,
    paneId: string,
    focus: (transport: T) => Promise<void>,
  ): Promise<void> {
    return this.projection(hostId).focusAgent(paneId, focus);
  }

  refresh(hostId: string): Promise<void> {
    return this.projection(hostId).refresh();
  }

  retry(hostId: string): Promise<void> {
    return this.projection(hostId).retry();
  }

  /** Re-proves a Host on a foreground return: a failed one restarts, others ping. */
  revalidate(hostId: string): Promise<void> {
    return this.projection(hostId).revalidate();
  }

  /** Stops a dial or backoff in flight; the Host rests until `retry`. */
  stopConnecting(hostId: string): Promise<void> {
    return this.projection(hostId).session.suspend();
  }

  hasHost(hostId: string): boolean {
    return this.projections.has(hostId);
  }

  private projection(hostId: string): HostConsoleProjection<T> {
    const projection = this.projections.get(hostId);
    if (!projection) throw new Error('The Host is not listed.');
    return projection;
  }

  /** Sets what the rows cannot get from a snapshot: checkout line totals and context usage. */
  setRowExtras(
    hostId: string,
    paneId: string,
    extras: { changeTotals?: RowChangeTotals; contextUsage?: AgentContextUsage },
  ): void {
    this.extras.set(agentKey(hostId, paneId), extras);
    this.recompute();
  }

  private noteConnected(projection: { host: { id: string }; status?: { kind: string } }): boolean {
    if (projection.status?.kind === 'connected') this.connectedOnce.add(projection.host.id);
    return this.connectedOnce.has(projection.host.id);
  }

  private recompute(): void {
    const projections = [...this.projections.values()];
    const { rows, readyHosts } = selectConsole({
      hosts: projections,
      pins: this.options.pins,
      sortByHost: this.options.sortByHost,
      clocks: this.options.clocks,
    });
    this.state = {
      rows:
        this.extras.size === 0
          ? rows
          : rows.map((row) => ({ ...row, ...this.extras.get(rowKey(row)) })),
      readyHosts,
      hosts: projections.map((projection) => ({
        link: hostLink(projection.status, this.noteConnected(projection)),
        id: projection.host.id,
        name: projection.host.name,
        status: projection.status,
        isAwaitingSnapshot: projection.isAwaitingSnapshot,
        isStale: projection.isStale,
        syncError: projection.syncError,
        latencyMs: projection.latency,
        routeId: projection.routeId,
      })),
      revision: this.state.revision + 1,
    };
    for (const listener of [...this.listeners]) listener();
  }
}
