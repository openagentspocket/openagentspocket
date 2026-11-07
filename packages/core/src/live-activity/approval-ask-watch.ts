import type { ConsoleRow } from '../console/row';
import type { Clock } from '../hosts/cancellation';
import { type HostDataSource, HostDataStore } from '../hosts/host-data';
import type { ApprovalAsks } from '../notifications/approval-script';

/** The hook records an ask around the Blocked turn: the first read leaves it this long. */
export const FIRST_ASK_READ_MS = 7_000;

const NO_ASKS: ApprovalAsks = new Map();

export interface ApprovalAskWatchOptions {
  readonly clock: Clock;
  /** Whether this device answers from this Host's activity at all. */
  readonly isWatched: (hostId: string) => boolean;
  /** The Host's read, null when its plugin cannot answer. */
  readonly source: (hostId: string) => Promise<HostDataSource<ApprovalAsks> | null>;
  readonly run: (hostId: string, script: string) => Promise<string>;
  readonly onChange: (hostId: string) => void;
}

interface Watch {
  timer: unknown;
  stop: () => void;
}

/**
 * Keeps the prompts of each Host with a Blocked Agent, read from the Host while that lasts. Nothing
 * runs for a Host without one: the read starts on the Blocked turn and ends with it.
 */
export class ApprovalAskWatch {
  private readonly watches = new Map<string, Watch>();
  private readonly current = new Map<string, ApprovalAsks>();

  constructor(private readonly o: ApprovalAskWatchOptions) {}

  /** What the Host last said, only while this device still answers for it. */
  asks(hostId: string): ApprovalAsks {
    return this.o.isWatched(hostId) ? (this.current.get(hostId) ?? NO_ASKS) : NO_ASKS;
  }

  /** The Console feed: starts and stops reads as Agents turn Blocked and leave it. */
  rowsDidChange(rows: readonly ConsoleRow[]): void {
    const blocked = new Set(
      rows
        .filter((row) => row.agent.agent_status === 'blocked' && this.o.isWatched(row.hostId))
        .map((row) => row.hostId),
    );
    for (const hostId of [...this.watches.keys()]) if (!blocked.has(hostId)) this.drop(hostId);
    for (const hostId of blocked) if (!this.watches.has(hostId)) this.begin(hostId);
  }

  stop(): void {
    for (const hostId of [...this.watches.keys()]) this.drop(hostId);
  }

  private begin(hostId: string): void {
    const watch: Watch = { timer: null, stop: () => undefined };
    watch.timer = this.o.clock.setTimeout(() => {
      watch.timer = null;
      void this.open(hostId, watch);
    }, FIRST_ASK_READ_MS);
    this.watches.set(hostId, watch);
  }

  private async open(hostId: string, watch: Watch): Promise<void> {
    let source: HostDataSource<ApprovalAsks> | null;
    try {
      source = await this.o.source(hostId);
    } catch {
      // Unreachable for now: the next row change starts over.
      if (this.watches.get(hostId) === watch) this.watches.delete(hostId);
      return;
    }
    if (source === null || this.watches.get(hostId) !== watch) return;
    const store = new HostDataStore({
      source,
      clock: this.o.clock,
      run: (script) => this.o.run(hostId, script),
    });
    const off = store.subscribe(() => this.take(hostId, store.getState().value));
    watch.stop = () => {
      off();
      store.stop();
    };
    store.start();
  }

  private take(hostId: string, asks: ApprovalAsks | null): void {
    if (asks === null) return;
    const before = JSON.stringify([...(this.current.get(hostId) ?? NO_ASKS)]);
    if (JSON.stringify([...asks]) === before) return;
    this.current.set(hostId, asks);
    this.o.onChange(hostId);
  }

  private drop(hostId: string): void {
    const watch = this.watches.get(hostId);
    if (!watch) return;
    this.watches.delete(hostId);
    if (watch.timer !== null) this.o.clock.clearTimeout(watch.timer);
    watch.stop();
    if (this.current.delete(hostId)) this.o.onChange(hostId);
  }
}
