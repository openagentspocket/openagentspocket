import {
  type Host,
  type HostCatalog,
  type HostCatalogErrorCode,
  hostTrustKey,
  type IdFactory,
  type KnownHostsStore,
} from '@openagentspocket/core';

/** What the list groups by; the Console owns the live value once the transport lands. */
export type HostConnection = 'connected' | 'connecting' | 'cantConnect' | 'notConnected';

export interface HostsSnapshot {
  readonly hosts: readonly Host[];
  readonly loadError: HostCatalogErrorCode | null;
  readonly connections: Readonly<Record<string, HostConnection>>;
}

/**
 * The Hosts the screens read: the core catalog plus the connection state of each, as an
 * external store (`subscribe`/`getSnapshot` fit `useSyncExternalStore`).
 */
export class HostsModel {
  private snapshot: HostsSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(
    readonly catalog: HostCatalog,
    readonly knownHosts: KnownHostsStore,
    readonly newId: IdFactory,
  ) {
    this.snapshot = this.read({});
  }

  getSnapshot = (): HostsSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  find(id: string): Host | null {
    return this.snapshot.hosts.find((host) => host.id === id) ?? null;
  }

  connection(id: string): HostConnection {
    return this.snapshot.connections[id] ?? 'notConnected';
  }

  setConnection(id: string, state: HostConnection): void {
    this.publish({ ...this.snapshot.connections, [id]: state });
  }

  async add(host: Host, password: string | null): Promise<void> {
    await this.catalog.add(host, password);
    this.publish(this.snapshot.connections);
  }

  async update(host: Host, password: string | null): Promise<void> {
    await this.catalog.update(host, password);
    this.publish(this.snapshot.connections);
  }

  /** Removes the Host, its password and its pinned host key. */
  async remove(id: string): Promise<void> {
    await this.catalog.remove(id);
    const key = hostTrustKey(id);
    this.knownHosts.forgetFingerprints(key.host, key.port);
    const { [id]: _gone, ...connections } = this.snapshot.connections;
    this.publish(connections);
  }

  private read(connections: HostsSnapshot['connections']): HostsSnapshot {
    return {
      hosts: this.catalog.hosts,
      loadError: this.catalog.catalogLoadError,
      connections,
    };
  }

  private publish(connections: HostsSnapshot['connections']): void {
    this.snapshot = this.read(connections);
    for (const listener of this.listeners) listener();
  }
}
