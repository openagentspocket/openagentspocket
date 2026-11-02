import { type KeyValueStorage, MemoryStorage } from '../hosts/known-hosts';
import { type ConsoleRow, rowKey } from './row';
import { firstSeen, observing, reconciled, type StatusStamp } from './status-stamp';

export const STATUS_CLOCKS_STORAGE_KEY = 'status-inbox.stamps';
const BLOB_VERSION = 1;
/** Stamps older than this are dropped on load. */
export const STAMP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

interface Entry {
  readonly hostId: string;
  readonly paneId: string;
  readonly stamp: StatusStamp;
}

function decode(text: string | undefined): Entry[] {
  if (text === undefined) return [];
  try {
    const blob = JSON.parse(text) as { version?: unknown; entries?: unknown };
    // Ages are cheap to lose: an unknown version starts empty and the next write replaces it.
    if (blob.version !== BLOB_VERSION || !Array.isArray(blob.entries)) return [];
    return blob.entries.filter(
      (entry: Entry) =>
        typeof entry?.hostId === 'string' &&
        typeof entry.paneId === 'string' &&
        typeof entry.stamp?.since === 'number',
    );
  } catch {
    return [];
  }
}

/**
 * Remembers when each Agent entered its status, across launches, for the Status Inbox ages. Feed
 * it the Console's rows whenever they change, with the Hosts whose snapshot is current: an Agent
 * missing from a ready Host is gone; one on a Host that was away is reconciled, not observed.
 */
export class AgentStatusClocks {
  private entries = new Map<string, Entry>();
  private awaitingReconcile = new Set<string>();
  private readyHosts = new Set<string>();

  constructor(
    private readonly storage: KeyValueStorage = new MemoryStorage(),
    private readonly now: () => number = Date.now,
    private readonly storageKey: string = STATUS_CLOCKS_STORAGE_KEY,
  ) {
    const cutoff = now() - STAMP_RETENTION_MS;
    const loaded = decode(storage.getString(storageKey));
    for (const entry of loaded) {
      const key = `${entry.hostId}\u001f${entry.paneId}`;
      if (entry.stamp.since >= cutoff && !this.entries.has(key)) this.entries.set(key, entry);
    }
    this.awaitingReconcile = new Set(this.entries.keys());
    if (this.entries.size !== loaded.length) this.persist();
  }

  /** The stamp of an Agent key (see `agentKey`). */
  stamp(key: string): StatusStamp | undefined {
    return this.entries.get(key)?.stamp;
  }

  agentsDidChange(rows: readonly ConsoleRow[], readyHosts: ReadonlySet<string>): void {
    const now = this.now();
    for (const hostId of this.readyHosts) {
      if (readyHosts.has(hostId)) continue;
      for (const [key, entry] of this.entries) {
        if (entry.hostId === hostId) this.awaitingReconcile.add(key);
      }
    }
    this.readyHosts = new Set(readyHosts);

    const next = new Map(this.entries);
    const present = new Set<string>();
    for (const row of rows) {
      const key = rowKey(row);
      present.add(key);
      const current = next.get(key);
      const base = { hostId: row.hostId, paneId: row.agent.pane_id };
      if (!current) {
        next.set(key, { ...base, stamp: firstSeen(row.agent, now) });
        this.awaitingReconcile.delete(key);
      } else if (readyHosts.has(row.hostId) && this.awaitingReconcile.delete(key)) {
        next.set(key, { ...base, stamp: reconciled(current.stamp, row.agent, now) });
      } else {
        next.set(key, { ...base, stamp: observing(current.stamp, row.agent, now) });
      }
    }
    for (const [key, entry] of next) {
      if (readyHosts.has(entry.hostId) && !present.has(key)) {
        next.delete(key);
        this.awaitingReconcile.delete(key);
      }
    }
    if (this.sameAs(next)) return;
    this.entries = next;
    this.persist();
  }

  /** The user cleared this entry from the inbox. */
  dismiss(key: string): void {
    const entry = this.entries.get(key);
    if (!entry || entry.stamp.dismissed) return;
    this.entries = new Map(this.entries).set(key, {
      ...entry,
      stamp: { ...entry.stamp, dismissed: true },
    });
    this.persist();
  }

  /** Forgets Hosts that were removed. */
  retainHosts(hostIds: ReadonlySet<string>): void {
    const kept = [...this.entries].filter(([, entry]) => hostIds.has(entry.hostId));
    if (kept.length === this.entries.size) return;
    this.entries = new Map(kept);
    this.awaitingReconcile = new Set(
      [...this.awaitingReconcile].filter((key) => this.entries.has(key)),
    );
    this.persist();
  }

  private sameAs(next: ReadonlyMap<string, Entry>): boolean {
    if (next.size !== this.entries.size) return false;
    for (const [key, entry] of next) {
      if (JSON.stringify(entry.stamp) !== JSON.stringify(this.entries.get(key)?.stamp))
        return false;
    }
    return true;
  }

  private persist(): void {
    this.storage.set(
      this.storageKey,
      JSON.stringify({ version: BLOB_VERSION, entries: [...this.entries.values()] }),
    );
  }
}
