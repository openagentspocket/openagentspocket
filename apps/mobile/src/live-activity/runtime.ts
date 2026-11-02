import {
  type Clock,
  type Host,
  HostLiveActivityCoordinator,
  type KeyValueStorage,
  type LiveActivityController,
  LiveActivityPreferences,
  type NotificationKeyStore,
  type NotificationRegistrationCeremony,
  type NotificationTransportProvider,
  type PushDeviceToken,
  type RandomBytes,
} from '@openagentspocket/core';
import type { SshTransport } from '@openagentspocket/transport';
import type { ConsoleStore } from '@/console/store';

/** The saved Hosts as the runtime reads them; `HostsModel` satisfies it. */
export interface HostCatalogSource {
  getSnapshot(): { readonly hosts: readonly Host[] };
  subscribe(listener: () => void): () => void;
}

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
}

/**
 * Runs the Live Activity coordinator inside the app: follows the Console store's rows, pins and
 * connection state per Host, forgets Hosts the user removes, and reconciles on foreground.
 */
export class LiveActivityRuntime {
  readonly coordinator: HostLiveActivityCoordinator;
  private unsubscribe: (() => void)[] = [];
  private knownHostIds = new Set<string>();
  private started = false;

  constructor(private readonly deps: LiveActivityRuntimeDeps) {
    const { store } = deps;
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
    });
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const { store, hosts } = this.deps;
    this.knownHostIds = new Set(hosts.getSnapshot().hosts.map((host) => host.id));
    this.coordinator.agentsDidChange(store.getState().rows);
    this.unsubscribe = [
      store.subscribe(() => this.coordinator.agentsDidChange(store.getState().rows)),
      hosts.subscribe(() => this.hostsDidChange()),
    ];
    void this.coordinator.start();
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
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
  }

  get activitiesEnabled(): boolean {
    return this.coordinator.areActivitiesEnabled;
  }

  private hostsDidChange(): void {
    const current = new Set(this.deps.hosts.getSnapshot().hosts.map((host) => host.id));
    for (const hostId of this.knownHostIds) {
      if (!current.has(hostId)) void this.coordinator.forgetHost(hostId);
    }
    this.knownHostIds = current;
    this.coordinator.agentsDidChange(this.deps.store.getState().rows);
  }
}
