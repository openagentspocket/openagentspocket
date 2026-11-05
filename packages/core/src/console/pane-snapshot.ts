/** Lines read from a pane for its thumbnail: a few more than shown, so blank ones can be dropped. */
export const SNAPSHOT_READ_LINES = 16;

/**
 * The last `maxLines` lines with content, each cut to `maxColumns`: what a thumbnail of a pane
 * shows. Trailing blank lines (an idle prompt's empty screen) never take a slot.
 */
export function snapshotLines(text: string, maxLines: number, maxColumns: number): string[] {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+$/, ''));
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.slice(-maxLines).map((line) => [...line].slice(0, maxColumns).join(''));
}

export interface PaneSnapshotCacheOptions {
  /** The pane's recent text; rejects when the Host cannot read it. */
  read: (hostId: string, paneId: string) => Promise<string>;
  now: () => number;
  /** A snapshot younger than this is served without a read. */
  ttlMs?: number;
  /** Least recently used snapshots beyond this are dropped. */
  maxEntries?: number;
  /** Reads in flight at once, across every Host. */
  maxConcurrent?: number;
  maxLines?: number;
  maxColumns?: number;
}

interface Entry {
  lines: readonly string[];
  at: number;
}

const DEFAULTS = { ttlMs: 15_000, maxEntries: 60, maxConcurrent: 2, maxLines: 6, maxColumns: 28 };

/**
 * Thumbnails of panes, kept cheap: a read per pane at most once per `ttlMs`, one in flight per
 * pane, a few at a time overall, a failed read keeps the last snapshot. `get` returns the same
 * array until a read changes the text, so a view subscribed to one pane re-renders only then.
 */
export class PaneSnapshotCache {
  private readonly entries = new Map<string, Entry>();
  private readonly inFlight = new Set<string>();
  private readonly queue: { key: string; hostId: string; paneId: string }[] = [];
  private readonly listeners = new Set<() => void>();
  private running = 0;
  private readonly options: Required<Omit<PaneSnapshotCacheOptions, 'read' | 'now'>> &
    Pick<PaneSnapshotCacheOptions, 'read' | 'now'>;

  constructor(options: PaneSnapshotCacheOptions) {
    this.options = { ...DEFAULTS, ...options };
  }

  private static keyOf(hostId: string, paneId: string): string {
    return `${hostId}\u0000${paneId}`;
  }

  get = (hostId: string, paneId: string): readonly string[] | undefined => {
    return this.entries.get(PaneSnapshotCache.keyOf(hostId, paneId))?.lines;
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Reads the pane unless its snapshot is fresh or a read is already queued or running. */
  request(hostId: string, paneId: string): void {
    const key = PaneSnapshotCache.keyOf(hostId, paneId);
    const entry = this.entries.get(key);
    if (entry && this.options.now() - entry.at < this.options.ttlMs) return;
    if (this.inFlight.has(key)) return;
    this.inFlight.add(key);
    this.queue.push({ key, hostId, paneId });
    this.pump();
  }

  private pump(): void {
    while (this.running < this.options.maxConcurrent) {
      const next = this.queue.shift();
      if (!next) return;
      this.running += 1;
      void this.load(next.key, next.hostId, next.paneId);
    }
  }

  private async load(key: string, hostId: string, paneId: string): Promise<void> {
    try {
      const text = await this.options.read(hostId, paneId);
      this.store(key, snapshotLines(text, this.options.maxLines, this.options.maxColumns));
    } catch {
      // Keep the last snapshot; the next request past the ttl tries again.
      const old = this.entries.get(key);
      if (old) this.entries.set(key, { ...old, at: this.options.now() });
    } finally {
      this.inFlight.delete(key);
      this.running -= 1;
      this.pump();
    }
  }

  private store(key: string, lines: readonly string[]): void {
    const old = this.entries.get(key);
    const same =
      old !== undefined &&
      old.lines.length === lines.length &&
      old.lines.every((l, i) => l === lines[i]);
    this.entries.delete(key);
    this.entries.set(key, { lines: same ? (old?.lines ?? lines) : lines, at: this.options.now() });
    while (this.entries.size > this.options.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    if (!same) for (const listener of this.listeners) listener();
  }
}
