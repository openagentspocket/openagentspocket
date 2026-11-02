import { decodeHerdrEndpoint } from './herdr-endpoint';
import { AUTH_METHODS, type AuthMethod, decodeHost, type Host } from './host';
import type { KeyValueStorage } from './known-hosts';

/** Secure storage for passwords (expo-secure-store in the app). */
export interface SecretStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}

/** Volatile secrets for tests and previews. */
export class MemorySecretStore implements SecretStore {
  readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async deleteItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

export type HostCatalogErrorCode =
  /** `update` or `remove` named a Host the catalog does not hold. */
  | 'unknownHost'
  /** Stored data did not decode; it stays untouched so no write can turn it into loss. */
  | 'catalogUnreadable';

export class HostCatalogError extends Error {
  constructor(readonly code: HostCatalogErrorCode) {
    super(code);
    this.name = 'HostCatalogError';
  }
}

export const HOSTS_STORAGE_KEY = 'hosts';
export const HOST_CATALOG_VERSION = 1;

/** The secure-storage key of a Host's password. */
export function passwordAccount(hostId: string): string {
  return `host-password-${hostId}`;
}

/** The secure-storage key of a Host's RSA private key (PEM text). */
export function rsaKeyAccount(hostId: string): string {
  return `host-rsa-key-${hostId}`;
}

/** A stored entry: a Host this build reads, or one it keeps verbatim. */
type Entry = { readonly host: Host } | { readonly raw: unknown };

/**
 * Decodes each Host on its own, so a future authentication method or an
 * endpoint this build cannot read hides only that Host (and survives later
 * writes). Any other malformed Host makes the whole catalog unreadable.
 */
function decodeCatalog(text: string): Entry[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const { version, hosts } = (parsed ?? {}) as Record<string, unknown>;
  if (version !== HOST_CATALOG_VERSION || !Array.isArray(hosts)) return null;
  const entries: Entry[] = [];
  for (const raw of hosts) {
    const fields = (raw ?? {}) as Record<string, unknown>;
    if (typeof fields.authMethod !== 'string') return null;
    const unreadableEndpoint =
      fields.herdrEndpoint != null && decodeHerdrEndpoint(fields.herdrEndpoint) === null;
    if (!AUTH_METHODS.includes(fields.authMethod as AuthMethod) || unreadableEndpoint) {
      entries.push({ raw });
      continue;
    }
    const host = decodeHost(raw);
    if (!host) return null;
    entries.push({ host });
  }
  return entries;
}

/**
 * The Host catalog: add, edit, remove, persisted to key-value storage. Host
 * records carry no secret; passwords go to the secret store keyed by Host id.
 */
export class HostCatalog {
  private entries: Entry[] = [];
  private loadError: HostCatalogErrorCode | null = null;

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly secrets: SecretStore,
  ) {
    const stored = storage.getString(HOSTS_STORAGE_KEY);
    if (stored === undefined) return;
    const entries = decodeCatalog(stored);
    if (entries) this.entries = entries;
    else this.loadError = 'catalogUnreadable';
  }

  /** The Hosts this build reads, in catalog order. */
  get hosts(): readonly Host[] {
    return this.entries.flatMap((entry) => ('host' in entry ? [entry.host] : []));
  }

  get catalogLoadError(): HostCatalogErrorCode | null {
    return this.loadError;
  }

  /** Adds a Host, storing `password` when given. */
  async add(host: Host, password: string | null = null): Promise<void> {
    this.ensureWritable();
    await this.applyPassword(host, password);
    this.entries = [...this.entries, { host }];
    this.persist();
  }

  /** Replaces the Host with the same id; a null `password` leaves the stored one. */
  async update(host: Host, password: string | null = null): Promise<void> {
    this.ensureWritable();
    this.indexOf(host.id);
    await this.applyPassword(host, password);
    const index = this.indexOf(host.id);
    this.entries = this.entries.map((entry, i) => (i === index ? { host } : entry));
    this.persist();
  }

  /** Removes the Host and its stored password. */
  async remove(id: string): Promise<void> {
    this.ensureWritable();
    this.indexOf(id);
    await this.secrets.deleteItem(passwordAccount(id));
    await this.secrets.deleteItem(rsaKeyAccount(id));
    this.entries = this.entries.filter((entry) => !('host' in entry) || entry.host.id !== id);
    this.persist();
  }

  /** Moves the Host to `toIndex` among the Hosts this build reads; hidden entries keep their slots. */
  move(id: string, toIndex: number): void {
    this.ensureWritable();
    this.indexOf(id);
    const visible = this.hosts.slice();
    const from = visible.findIndex((host) => host.id === id);
    const [moved] = visible.splice(from, 1);
    if (!moved) return;
    visible.splice(Math.max(0, Math.min(toIndex, visible.length)), 0, moved);
    let next = 0;
    this.entries = this.entries.map((entry) => {
      if (!('host' in entry)) return entry;
      const host = visible[next++];
      return host ? { host } : entry;
    });
    this.persist();
  }

  /** The stored password, or null when none was saved. */
  password(host: Host): Promise<string | null> {
    return this.secrets.getItem(passwordAccount(host.id));
  }

  /** The stored RSA private key (PEM), or null when none was saved. */
  rsaKey(host: Host): Promise<string | null> {
    return this.secrets.getItem(rsaKeyAccount(host.id));
  }

  /** Stores the Host's RSA private key in the secret store; null removes it. */
  async setRsaKey(host: Host, privateKey: string | null): Promise<void> {
    this.indexOf(host.id);
    if (privateKey === null) await this.secrets.deleteItem(rsaKeyAccount(host.id));
    else await this.secrets.setItem(rsaKeyAccount(host.id), privateKey);
  }

  private indexOf(id: string): number {
    const index = this.entries.findIndex((entry) => 'host' in entry && entry.host.id === id);
    if (index < 0) throw new HostCatalogError('unknownHost');
    return index;
  }

  /** A Host switched off password authentication keeps no stale password around. */
  private async applyPassword(host: Host, password: string | null): Promise<void> {
    const account = passwordAccount(host.id);
    if (host.authMethod !== 'password') await this.secrets.deleteItem(account);
    else if (password !== null) await this.secrets.setItem(account, password);
  }

  private ensureWritable(): void {
    if (this.loadError) throw new HostCatalogError(this.loadError);
  }

  private persist(): void {
    const hosts = this.entries.map((entry) => ('host' in entry ? entry.host : entry.raw));
    this.storage.set(HOSTS_STORAGE_KEY, JSON.stringify({ version: HOST_CATALOG_VERSION, hosts }));
  }
}
