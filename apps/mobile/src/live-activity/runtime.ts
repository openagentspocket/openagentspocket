import {
  type ActivityTap,
  ActivityTapRunner,
  type ApprovalApplyRequest,
  type ApprovalAskReading,
  ApprovalAskWatch,
  type ApprovalLedger,
  type ApprovalOutcome,
  type Clock,
  type Host,
  type HostDataSource,
  HostLiveActivityCoordinator,
  hostDisplayName,
  type KeyValueStorage,
  type LiveActivityController,
  LiveActivityPreferences,
  type NotificationKeyStore,
  type NotificationRegistrationCeremony,
  type NotificationTransportProvider,
  type PushDeviceToken,
  type RandomBytes,
  type StoredApprovalOptIns,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import type { SshTransport } from '@openagentspocket/transport';
import type { ConsoleStore } from '@/console/store';

/** The saved Hosts as the runtime reads them; `HostsModel` satisfies it. */
export interface HostCatalogSource {
  getSnapshot(): { readonly hosts: readonly Host[] };
  subscribe(listener: () => void): () => void;
}

/** What answering from an activity needs of a Host, over its connection. */
export interface ApprovalHost {
  /** The Host's read of its asks; null when its plugin cannot answer. */
  source(hostId: string): Promise<HostDataSource<ApprovalAskReading> | null>;
  run(hostId: string, script: string): Promise<string>;
  /** Waits for the Host a tap may have launched the app for, and reads it now. */
  readAsks(hostId: string): Promise<ApprovalAskReading>;
  apply(hostId: string, request: ApprovalApplyRequest): Promise<string>;
}

export interface LiveActivityApprovals {
  readonly optIns: Pick<StoredApprovalOptIns, 'isEnabled' | 'setEnabled'>;
  readonly ledger: ApprovalLedger;
  readonly host: ApprovalHost;
  /** Device owner authentication, with no reuse of an earlier success. */
  confirmOwner(reason: string): Promise<boolean>;
}

/** What a tap came to, for the toast. Null when the same prompt's tap was already running. */
export type ActivityTapResult = { readonly outcome: ApprovalOutcome; readonly host: string } | null;

export interface LiveActivityRuntimeDeps {
  readonly store: ConsoleStore<SshTransport>;
  readonly hosts: HostCatalogSource;
  readonly controller: LiveActivityController;
  readonly storage: KeyValueStorage;
  readonly transports: NotificationTransportProvider;
  readonly keys: NotificationKeyStore;
  readonly ceremony: NotificationRegistrationCeremony;
  readonly clock: Clock;
  readonly randomBytes: RandomBytes;
  readonly deviceToken: () => PushDeviceToken | null;
  readonly approvals: LiveActivityApprovals;
}

/** A named session without an endpoint has no socket the app can give the plugin's scripts. */
const canReadAsks = (host: Host | undefined) =>
  host !== undefined && (host.sessionName === '' || host.herdrEndpoint !== null);

/**
 * Runs the Live Activity coordinator inside the app: follows the Console store's rows, pins and
 * connection state per Host, forgets Hosts the user removes, and reconciles on foreground. While an
 * Agent of an opted-in Host is Blocked it reads the Host's asks, and it answers the buttons' links.
 */
export class LiveActivityRuntime {
  readonly coordinator: HostLiveActivityCoordinator;
  private readonly asks: ApprovalAskWatch;
  private readonly taps: ActivityTapRunner;
  private unsubscribe: (() => void)[] = [];
  private knownHostIds = new Set<string>();
  private started = false;

  constructor(private readonly deps: LiveActivityRuntimeDeps) {
    const { store, approvals } = deps;
    const summary = (hostId: string) => store.getState().hosts.find((host) => host.id === hostId);
    this.coordinator = new HostLiveActivityCoordinator({
      controller: deps.controller,
      preferences: new LiveActivityPreferences(deps.storage),
      transports: deps.transports,
      keys: deps.keys,
      ceremony: deps.ceremony,
      clock: deps.clock,
      randomBytes: deps.randomBytes,
      deviceToken: deps.deviceToken,
      hosts: () => deps.hosts.getSnapshot().hosts,
      isAwaitingSnapshot: (hostId) => summary(hostId)?.isAwaitingSnapshot ?? true,
      connectionStatus: (hostId) => summary(hostId)?.status,
      pinnedPaneIds: (hostId) => store.pinnedPaneIds(hostId),
      approvalAsks: (hostId) => this.asks.asks(hostId),
      isActionInFlight: (hostId, paneId, episodeId) =>
        this.taps.isRunning(hostId, paneId, episodeId),
    });
    this.asks = new ApprovalAskWatch({
      clock: deps.clock,
      isWatched: (hostId) => this.answersFor(hostId),
      source: (hostId) => approvals.host.source(hostId),
      run: (hostId, script) => approvals.host.run(hostId, script),
      onChange: (hostId) => this.coordinator.approvalAsksDidChange(hostId),
    });
    this.taps = new ActivityTapRunner({
      controller: deps.controller,
      keys: deps.keys,
      randomBytes: deps.randomBytes,
      gates: {
        isActivityOn: (hostId) => this.answersFor(hostId),
        optIns: approvals.optIns,
        ledger: approvals.ledger,
        nowSeconds: () => Math.floor(Date.now() / 1000),
        readAsks: (hostId) => approvals.host.readAsks(hostId),
        authenticate: ({ prompt }) => approvals.confirmOwner(t('Approve: %@', prompt)),
        apply: (hostId, request) => approvals.host.apply(hostId, request),
      },
    });
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const { store, hosts } = this.deps;
    this.knownHostIds = new Set(hosts.getSnapshot().hosts.map((host) => host.id));
    this.rowsDidChange();
    this.unsubscribe = [
      store.subscribe(() => this.rowsDidChange()),
      hosts.subscribe(() => this.hostsDidChange()),
    ];
    void this.coordinator.start();
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
    this.asks.stop();
    await this.coordinator.stop();
  }

  /** The app returned to the foreground. */
  foreground(): Promise<void> {
    return this.coordinator.reconcile();
  }

  isEnabled(hostId: string): boolean {
    return this.coordinator.isEnabled(hostId);
  }

  setEnabled(enabled: boolean, hostId: string): void {
    this.coordinator.setEnabled(enabled, hostId);
    if (this.started) this.asks.rowsDidChange(this.deps.store.getState().rows);
  }

  /** A Live Activity button's link: runs it through the gates and shows the result on the activity. */
  async answer(tap: ActivityTap): Promise<ActivityTapResult> {
    const outcome = await this.taps.run(tap);
    if (outcome === null) return null;
    const host = this.host(tap.hostId);
    return { outcome, host: host ? hostDisplayName(host) : '' };
  }

  get activitiesEnabled(): boolean {
    return this.coordinator.areActivitiesEnabled;
  }

  private host(hostId: string): Host | undefined {
    return this.deps.hosts.getSnapshot().hosts.find((host) => host.id === hostId);
  }

  /** Whether this device answers from this Host's activity: both toggles, and a readable session. */
  private answersFor(hostId: string): boolean {
    return (
      this.coordinator.isEnabled(hostId) &&
      this.deps.approvals.optIns.isEnabled(hostId) &&
      canReadAsks(this.host(hostId))
    );
  }

  private rowsDidChange(): void {
    const { rows } = this.deps.store.getState();
    this.coordinator.agentsDidChange(rows);
    this.asks.rowsDidChange(rows);
  }

  private hostsDidChange(): void {
    const current = new Set(this.deps.hosts.getSnapshot().hosts.map((host) => host.id));
    for (const hostId of this.knownHostIds) {
      if (!current.has(hostId)) void this.coordinator.forgetHost(hostId);
    }
    this.knownHostIds = current;
    this.rowsDidChange();
  }
}
