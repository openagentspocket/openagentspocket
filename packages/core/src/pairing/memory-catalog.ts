import type { NewPairedHost, PairingCatalogHost, PairingHostCatalog } from './host-catalog';

/**
 * An in-memory `PairingHostCatalog` for tests and demos. `unwritable` makes
 * every write throw, as an unreadable on-device catalog does.
 */
export class MemoryPairingCatalog implements PairingHostCatalog {
  saved: PairingCatalogHost[] = [];
  readonly pins = new Map<string, string[]>();
  unwritable = false;
  private nextId = 1;

  async hosts(): Promise<readonly PairingCatalogHost[]> {
    return this.saved;
  }

  async pinnedFingerprints(hostId: string): Promise<readonly string[]> {
    return this.pins.get(hostId) ?? [];
  }

  async addHost(host: NewPairedHost): Promise<string> {
    this.assertWritable();
    const id = `host-${this.nextId++}`;
    this.saved = [
      ...this.saved,
      {
        id,
        username: host.username,
        usesDeviceKey: true,
        endpoint: host.endpoint,
        sessionName: '',
        routes: host.addresses.map((address) => ({
          address,
          port: host.port,
          usesJumpHost: false,
        })),
      },
    ];
    this.pins.set(id, [host.hostKeyFingerprint]);
    return id;
  }

  async addRoutes(
    hostId: string,
    routes: readonly { address: string; port: number }[],
  ): Promise<void> {
    this.assertWritable();
    this.saved = this.saved.map((host) =>
      host.id === hostId
        ? {
            ...host,
            routes: [...host.routes, ...routes.map((route) => ({ ...route, usesJumpHost: false }))],
          }
        : host,
    );
  }

  /** Replaces a saved Host, as preflight does when it picks a session. */
  update(host: PairingCatalogHost): void {
    this.saved = this.saved.map((saved) => (saved.id === host.id ? host : saved));
  }

  private assertWritable(): void {
    if (this.unwritable) throw new Error('the Host catalog is unreadable');
  }
}
