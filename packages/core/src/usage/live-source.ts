import { message } from '../errors/text';
import type { Clock } from '../hosts/cancellation';
import type { KeyValueStorage } from '../hosts/known-hosts';
import { isPluginFeatureSupported, parsePluginVersion } from '../hosts/plugin-version';
import { ClaudeAccountError } from './account-file';
import type { AccountFileStore, UsageSource } from './demo';
import { featureRequirementNote, type UsageHostPort } from './host-port';
import { UsageHostStore } from './host-store';
import type { HostReading } from './scope';

/** A Host as the live Usage source sees it; a null port means no usable connection right now. */
export interface UsageHostEntry {
  readonly id: string;
  readonly name: string;
  readonly port: UsageHostPort | null;
}

export interface LiveUsageSourceOptions {
  readonly clock: Clock;
  readonly storage: KeyValueStorage;
  readonly timeZone?: () => string;
  readonly wallNow?: () => number;
}

/** How often a watching surface checks for a report older than `USAGE_STALE_MS`. */
const STALE_CHECK_MS = 60_000;

/**
 * Every Host's `UsageHostStore` behind the `UsageSource` the Usage screens read, plus the
 * Accounts file of each Host. Hosts are replaced as the Console's connections come and go.
 */
export class LiveUsageSource implements UsageSource {
  private entries: readonly UsageHostEntry[] = [];
  private readonly stores = new Map<string, UsageHostStore>();
  private readonly unsubscribes = new Map<string, () => void>();
  private readonly listeners = new Set<() => void>();
  private readonly gates = new Map<string, Promise<unknown>>();
  private watchers = 0;
  private staleTimer: unknown = null;

  constructor(private readonly options: LiveUsageSourceOptions) {}

  setHosts(entries: readonly UsageHostEntry[]): void {
    this.entries = entries;
    const ids = new Set(entries.map((entry) => entry.id));
    for (const [id, store] of this.stores) {
      if (ids.has(id)) continue;
      store.stop();
      this.unsubscribes.get(id)?.();
      this.unsubscribes.delete(id);
      this.stores.delete(id);
    }
    for (const entry of entries) {
      const store = this.storeFor(entry.id);
      const regained = !store.isConnected && entry.port !== null;
      store.setPort(entry.port);
      if (regained && this.watchers > 0) void store.refreshIfStale();
    }
    this.emit();
  }

  store(hostId: string): UsageHostStore | undefined {
    return this.stores.get(hostId);
  }

  async readings(): Promise<HostReading[]> {
    return this.entries.map((entry) => this.storeFor(entry.id).reading(entry.id, entry.name));
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async refresh(): Promise<void> {
    await Promise.all(
      this.entries.filter((e) => e.port).map((e) => this.storeFor(e.id).pullToRefresh()),
    );
  }

  watch(): () => void {
    this.watchers += 1;
    if (this.watchers === 1) this.scheduleStaleCheck();
    this.checkStale();
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      this.watchers -= 1;
      if (this.watchers === 0) {
        this.options.clock.clearTimeout(this.staleTimer);
        this.staleTimer = null;
        for (const store of this.stores.values()) store.stop();
      }
    };
  }

  readonly claudeLimits = {
    enabled: (): boolean =>
      this.entries.some((entry) => this.stores.get(entry.id)?.claudeLimitsEnabled === true),
    set: (enabled: boolean): void => {
      for (const entry of this.entries) {
        const store = this.storeFor(entry.id);
        store.setClaudeLimits(enabled);
        if (this.watchers > 0 && entry.port) void store.refresh();
      }
    },
  };

  /** The Accounts file of every Host, gated on the plugin release and serialized per Host. */
  readonly accountFiles: AccountFileStore = {
    read: (hostId) => this.gated(hostId, (port) => port.readAccountFile()),
    write: async (hostId, text) => {
      await this.gated(hostId, (port) => port.replaceAccountFile(text));
      void this.storeFor(hostId).readAfterAccountChange();
    },
  };

  private storeFor(hostId: string): UsageHostStore {
    let store = this.stores.get(hostId);
    if (!store) {
      store = new UsageHostStore({ hostId, ...this.options });
      this.stores.set(hostId, store);
      this.unsubscribes.set(
        hostId,
        store.subscribe(() => this.emit()),
      );
    }
    return store;
  }

  private gated<T>(hostId: string, run: (port: UsageHostPort) => Promise<T>): Promise<T> {
    const port = this.entries.find((e) => e.id === hostId)?.port;
    if (!port) return Promise.reject(new Error('Host is not connected'));
    const store = this.storeFor(hostId);
    const previous = this.gates.get(hostId) ?? Promise.resolve();
    const task = previous
      .catch(() => undefined)
      .then(async () => {
        if (!store.supportsClaudeAccounts) await this.requireAccounts(port);
        return run(port);
      });
    this.gates.set(hostId, task);
    return task;
  }

  /** The last read may predate the plugin listing: ask once before refusing. */
  private async requireAccounts(port: UsageHostPort): Promise<void> {
    const plugin = await port.readPlugin();
    const version = plugin ? parsePluginVersion(plugin.version) : null;
    if (version && isPluginFeatureSupported('claudeAccounts', version)) return;
    throw new ClaudeAccountError({
      kind: 'pluginRequirement',
      note: version
        ? featureRequirementNote('claudeAccounts', version)
        : message('Enable the Agentico plugin on this Host to change its Accounts.'),
    });
  }

  private scheduleStaleCheck(): void {
    this.staleTimer = this.options.clock.setTimeout(() => {
      this.checkStale();
      this.scheduleStaleCheck();
    }, STALE_CHECK_MS);
  }

  private checkStale(): void {
    for (const entry of this.entries) {
      if (entry.port) void this.storeFor(entry.id).refreshIfStale();
    }
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
