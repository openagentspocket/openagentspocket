import {
  type Clock,
  consoleSubscriptions,
  EventsSession,
  type EventsSessionStatus,
  type Host,
  type HostKeyPolicy,
  type KnownHostsStore,
  type ReconnectPolicy,
  TransportFailure,
} from '@openagentspocket/core';
import { connectTransport, type SshTransport } from '@openagentspocket/transport';
import type { SshModule } from 'agentico-ssh';
import type { ConsoleStore } from '@/console/store';
import type { HostConnection } from '@/features/hosts/HostsModel';
import { transportSettingsFor } from './transportSettings';

/** The saved Hosts as the manager reads them; `HostsModel` satisfies it. */
export interface HostSource {
  getSnapshot(): { readonly hosts: readonly Host[] };
  subscribe(listener: () => void): () => void;
}

export interface ConnectionManagerOptions {
  readonly hosts: HostSource;
  readonly store: ConsoleStore<SshTransport>;
  readonly ssh: SshModule;
  /** Alias of the device key; created on first use through `ensureDeviceKey`. */
  readonly keyAlias: string;
  readonly ensureDeviceKey: () => Promise<unknown>;
  readonly knownHosts: KnownHostsStore;
  /** The Trust this Host? alert. */
  readonly confirmFirstConnect: HostKeyPolicy['confirmFirstConnect'];
  readonly clock: Clock;
  /** Backoff between reconnects of a failing Host (the session applies it). */
  readonly reconnect?: ReconnectPolicy;
  /** Mirrors each Host's state onto the Hosts screens. */
  readonly onConnection?: (hostId: string, state: HostConnection) => void;
  /** Starts active; the app root flips it with AppState. */
  readonly initiallyActive?: boolean;
  readonly connect?: typeof connectTransport;
}

/** The Hosts-list state of a session status. */
export function connectionFor(status: EventsSessionStatus | undefined): HostConnection {
  switch (status?.kind) {
    case 'connected':
      return 'connected';
    case 'connecting':
    case 'reconnecting':
      return 'connecting';
    case 'failed':
      return 'cantConnect';
    default:
      return 'notConnected';
  }
}

interface Entry {
  readonly host: Host;
  readonly signature: string;
  readonly session: EventsSession<SshTransport>;
}

/**
 * Owns one `SshTransport` (through one `EventsSession`) per saved Host and feeds each to the
 * Console store. The session reconnects with backoff while active; the manager follows the
 * catalog (add, edit, remove) and the app's foreground state.
 */
export class ConnectionManager {
  private readonly entries = new Map<string, Entry>();
  private active: boolean;
  private stopped = false;
  private unsubscribe: (() => void) | undefined;
  private unsubscribeStore: (() => void) | undefined;
  private readonly lastState = new Map<string, HostConnection>();

  constructor(private readonly options: ConnectionManagerOptions) {
    this.active = options.initiallyActive ?? true;
  }

  /** Connects every saved Host and keeps following the catalog. */
  start(): void {
    if (this.unsubscribe || this.stopped) return;
    this.unsubscribe = this.options.hosts.subscribe(() => this.sync());
    this.unsubscribeStore = this.options.store.subscribe(() => this.reportConnections());
    this.sync();
  }

  stop(): void {
    this.stopped = true;
    this.unsubscribe?.();
    this.unsubscribeStore?.();
    for (const id of [...this.entries.keys()]) this.drop(id);
  }

  get isActive(): boolean {
    return this.active;
  }

  hostIds(): string[] {
    return [...this.entries.keys()];
  }

  /** Foreground resumes (or re-proves) every Host; background suspends them. */
  async setActive(active: boolean): Promise<void> {
    if (this.stopped || this.active === active) return;
    this.active = active;
    const work = [...this.entries.values()].map((entry) => this.applyActive(entry, active));
    await Promise.all(work);
  }

  /**
   * Runs an operation on a Host's current Transport (waiting out a reconnect); a Host that is not
   * managed is unreachable.
   */
  withTransport<V>(hostId: string, operation: (transport: SshTransport) => Promise<V>): Promise<V> {
    const entry = this.entries.get(hostId);
    if (!entry) {
      return Promise.reject(
        new TransportFailure({ kind: 'sshUnreachable', detail: 'The Host is not connected.' }),
      );
    }
    return entry.session.withTransport(operation);
  }

  /** A user-requested retry, for example after trusting a changed key. */
  async reconnect(hostId: string): Promise<void> {
    const entry = this.entries.get(hostId);
    if (!entry || this.stopped) return;
    if (!this.active) return;
    await this.options.store.retry(hostId);
  }

  private async applyActive(entry: Entry, active: boolean): Promise<void> {
    const { store } = this.options;
    if (!active) {
      await entry.session.suspend();
      return;
    }
    const status = store.getState().hosts.find((host) => host.id === entry.host.id)?.status;
    if (!status || status.kind === 'suspended') await entry.session.resume();
    else await store.revalidate(entry.host.id);
  }

  private signatureOf(host: Host): string {
    return JSON.stringify(host);
  }

  private sync(): void {
    if (this.stopped) return;
    const hosts = this.options.hosts.getSnapshot().hosts;
    const wanted = new Map(hosts.map((host) => [host.id, host]));
    for (const [id, entry] of [...this.entries]) {
      const host = wanted.get(id);
      if (!host || this.signatureOf(host) !== entry.signature) this.drop(id);
    }
    for (const host of hosts) if (!this.entries.has(host.id)) this.add(host);
  }

  private add(host: Host): void {
    const session = new EventsSession<SshTransport>({
      subscriptions: consoleSubscriptions([]),
      connect: () => this.dial(host),
      clock: this.options.clock,
      reconnect: this.options.reconnect,
    });
    this.entries.set(host.id, { host, signature: this.signatureOf(host), session });
    this.options.store.addHost(
      { id: host.id, name: host.name, username: host.username },
      session,
      this.active,
    );
  }

  private drop(id: string): void {
    this.entries.delete(id);
    this.lastState.delete(id);
    // Ends the projection, which ends its session.
    this.options.store.removeHost(id);
    this.options.onConnection?.(id, 'notConnected');
  }

  private async dial(host: Host): Promise<SshTransport> {
    const { options } = this;
    await options.ensureDeviceKey();
    const settings = transportSettingsFor(host, {
      keyAlias: options.keyAlias,
      clock: options.clock,
      policy: {
        knownHosts: options.knownHosts,
        confirmFirstConnect: options.confirmFirstConnect,
      },
    });
    return (options.connect ?? connectTransport)(options.ssh, settings);
  }

  private reportConnections(): void {
    const report = this.options.onConnection;
    if (!report) return;
    for (const summary of this.options.store.getState().hosts) {
      if (!this.entries.has(summary.id)) continue;
      const state = connectionFor(summary.status);
      if (this.lastState.get(summary.id) === state) continue;
      this.lastState.set(summary.id, state);
      report(summary.id, state);
    }
  }
}
