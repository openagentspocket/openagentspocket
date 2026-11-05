import type { Clock } from '../hosts/cancellation';
import type { ChangesStore } from './store';

/** The Checkout a row or status line reads: a Host's directory, and the Agent that drives freshness. */
export interface RowChangesTarget {
  readonly hostId: string;
  readonly directory: string;
  /** The Agent whose status edges trigger reads; the first watcher of a directory decides. */
  readonly paneId?: string;
}

export interface RowChangesWatch {
  readonly store: ChangesStore;
  /** Stops this watcher; the last one ends the store's reads. */
  release(): void;
}

export interface RowChangesOptions {
  /** One store per Checkout directory; null when the target cannot be read. */
  make(target: RowChangesTarget): ChangesStore | null;
  readonly clock: Clock;
  /** Re-read period while someone watches; bounded so an idle Host is never polled hard. */
  readonly intervalMs?: number;
}

export const ROW_CHANGES_INTERVAL_MS = 60_000;

interface Entry {
  readonly store: ChangesStore;
  watchers: number;
  stop: (() => void) | null;
  timer: unknown;
}

const keyOf = (target: RowChangesTarget) => `${target.hostId}\u0000${target.directory}`;

/**
 * The Agents list's reads of git, shared by everything that shows a Checkout (rows, the status
 * line, the Board): one `ChangesStore` per Host directory, following only while watched. The
 * first watcher starts it (a read once it settles, one after each exit from Working, one each
 * period); the last one stops it and cancels a read still queued. A store is kept after that, so
 * a row that scrolls back shows its last numbers at once.
 */
export class RowChanges {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly options: RowChangesOptions) {}

  watch(target: RowChangesTarget): RowChangesWatch | null {
    const key = keyOf(target);
    let entry = this.entries.get(key);
    if (!entry) {
      const store = this.options.make(target);
      if (!store) return null;
      store.announcesAutomaticUpdates = false;
      entry = { store, watchers: 0, stop: null, timer: null };
      this.entries.set(key, entry);
    }
    const live = entry;
    live.watchers += 1;
    if (live.watchers === 1) this.start(live);
    let released = false;
    return {
      store: live.store,
      release: () => {
        if (released) return;
        released = true;
        live.watchers -= 1;
        if (live.watchers === 0) this.halt(live);
      },
    };
  }

  /** The store of a Checkout, when one was made (a read in progress or kept). */
  storeFor(target: RowChangesTarget): ChangesStore | undefined {
    return this.entries.get(keyOf(target))?.store;
  }

  /** Drops the stores of directories no longer shown; watched ones stay. */
  retain(keep: (target: string) => boolean): void {
    for (const [key, entry] of this.entries) {
      if (entry.watchers === 0 && !keep(key)) this.entries.delete(key);
    }
  }

  private start(entry: Entry): void {
    entry.stop = entry.store.followForRowTotals();
    this.schedule(entry);
  }

  private schedule(entry: Entry): void {
    const period = this.options.intervalMs ?? ROW_CHANGES_INTERVAL_MS;
    entry.timer = this.options.clock.setTimeout(() => {
      entry.timer = null;
      if (entry.watchers === 0) return;
      void entry.store.refresh(true);
      this.schedule(entry);
    }, period);
  }

  private halt(entry: Entry): void {
    entry.stop?.();
    entry.stop = null;
    if (entry.timer !== null) this.options.clock.clearTimeout(entry.timer);
    entry.timer = null;
  }
}
