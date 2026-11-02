import { type KeyValueStorage, MemoryStorage } from '../hosts/known-hosts';

export const PINNED_AGENTS_STORAGE_KEY = 'pinned-agents';
const BLOB_VERSION = 1;

interface PinEntry {
  readonly hostId: string;
  readonly paneId: string;
}

function decodeEntries(text: string | undefined): PinEntry[] {
  if (text === undefined) return [];
  try {
    const blob: unknown = JSON.parse(text);
    if (typeof blob !== 'object' || blob === null) return [];
    const { version, entries } = blob as { version?: unknown; entries?: unknown };
    // Pins are cheap to lose: an unknown version starts empty and the next write replaces it.
    if (version !== BLOB_VERSION || !Array.isArray(entries)) return [];
    return entries.flatMap((entry: unknown) => {
      const { hostId, paneId } = (entry ?? {}) as { hostId?: unknown; paneId?: unknown };
      return typeof hostId === 'string' && typeof paneId === 'string' ? [{ hostId, paneId }] : [];
    });
  } catch {
    return [];
  }
}

/**
 * The Agents the user pinned, most recent first; the position is the pin rank that leads the
 * Console order. Entries are kept until unpinned: the store never sees a live Agent list, so a
 * closed pane does not drop its own pin.
 */
export class PinnedAgents {
  private entries: PinEntry[];
  private revisionCount = 0;

  constructor(
    private readonly storage: KeyValueStorage = new MemoryStorage(),
    private readonly storageKey: string = PINNED_AGENTS_STORAGE_KEY,
  ) {
    this.entries = decodeEntries(storage.getString(storageKey));
  }

  /** Bumps on every change, so a view can tell its sort is stale. */
  get revision(): number {
    return this.revisionCount;
  }

  isPinned(hostId: string, paneId: string): boolean {
    return this.pinRank(hostId, paneId) !== undefined;
  }

  pinRank(hostId: string, paneId: string): number | undefined {
    const index = this.entries.findIndex(
      (entry) => entry.hostId === hostId && entry.paneId === paneId,
    );
    return index < 0 ? undefined : index;
  }

  pinnedPaneIds(hostId: string): string[] {
    return this.entries.filter((entry) => entry.hostId === hostId).map((entry) => entry.paneId);
  }

  togglePin(hostId: string, paneId: string): void {
    if (this.isPinned(hostId, paneId)) this.drop(hostId, paneId);
    else this.entries = [{ hostId, paneId }, ...this.entries];
    this.commit();
  }

  removePin(hostId: string, paneId: string): void {
    if (!this.isPinned(hostId, paneId)) return;
    this.drop(hostId, paneId);
    this.commit();
  }

  /**
   * Swaps a pin with its nearest neighbor toward the front (`up`) or back (`down`) among the pins
   * `isListed` accepts, so a pin of a closed pane never absorbs a move. False when it cannot move.
   */
  movePin(
    hostId: string,
    paneId: string,
    direction: 'up' | 'down',
    isListed: (hostId: string, paneId: string) => boolean = () => true,
  ): boolean {
    const from = this.pinRank(hostId, paneId);
    if (from === undefined) return false;
    const step = direction === 'up' ? -1 : 1;
    for (let to = from + step; to >= 0 && to < this.entries.length; to += step) {
      const other = this.entries[to];
      if (!other || !isListed(other.hostId, other.paneId)) continue;
      const next = [...this.entries];
      const moved = next[from];
      if (!moved) return false;
      next[from] = other;
      next[to] = moved;
      this.entries = next;
      this.commit();
      return true;
    }
    return false;
  }

  private drop(hostId: string, paneId: string): void {
    this.entries = this.entries.filter(
      (entry) => !(entry.hostId === hostId && entry.paneId === paneId),
    );
  }

  private commit(): void {
    this.storage.set(
      this.storageKey,
      JSON.stringify({ version: BLOB_VERSION, entries: this.entries }),
    );
    this.revisionCount += 1;
  }
}
