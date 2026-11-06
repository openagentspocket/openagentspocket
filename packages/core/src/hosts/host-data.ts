import { Observable } from '../changes/observable';
import { errorMessage } from '../errors/message';
import type { Clock } from './cancellation';

/**
 * Something to know about a Host, read by one script. A new source is one of these and nothing
 * else: `HostDataStore` owns refreshing, failures and backoff, `useHostData` the screen's side.
 */
export interface HostDataSource<T> {
  /** Names it in a cache and in a refusal on a Host that cannot run scripts. */
  readonly key: string;
  /** POSIX sh. Its stdout goes to `parse`. */
  readonly script: string;
  /** Throws on output it cannot read: that counts as a failed read. */
  parse(output: string): T;
  /** How often it is read again while watched; absent reads it once. */
  readonly refreshMs?: number;
}

export interface HostDataState<T> {
  /** The last good reading: a failed refresh keeps it. */
  readonly value: T | null;
  readonly failure: string | null;
  readonly isLoading: boolean;
}

export interface HostDataStoreOptions<T> {
  readonly source: HostDataSource<T>;
  /** Runs a script on the Host and gives back its stdout. */
  run(script: string): Promise<string>;
  readonly clock: Clock;
}

/** A failed read retries doubling from this, up to `MAX_RETRY_MS`. */
export const FIRST_RETRY_MS = 3_000;
export const MAX_RETRY_MS = 60_000;

/** One source on one Host: read while started, stopped when nobody watches. */
export class HostDataStore<T> extends Observable<HostDataState<T>> {
  private timer: unknown = null;
  private running = false;
  private retryMs = FIRST_RETRY_MS;

  constructor(private readonly options: HostDataStoreOptions<T>) {
    super({ value: null, failure: null, isLoading: false });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.read();
  }

  stop(): void {
    this.running = false;
    this.cancelTimer();
  }

  private cancelTimer(): void {
    if (this.timer !== null) this.options.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(ms: number): void {
    this.timer = this.options.clock.setTimeout(() => void this.read(), ms);
  }

  private async read(): Promise<void> {
    this.cancelTimer();
    const { source, run } = this.options;
    this.set({ isLoading: true });
    try {
      const value = source.parse(await run(source.script));
      if (!this.running) return;
      this.retryMs = FIRST_RETRY_MS;
      this.set({ value, failure: null, isLoading: false });
      if (source.refreshMs !== undefined) this.schedule(source.refreshMs);
    } catch (error) {
      if (!this.running) return;
      this.set({ failure: errorMessage(error), isLoading: false });
      this.schedule(this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
    }
  }
}

/** What the Host runs on, as `uname` names it. */
export const hostSystemSource: HostDataSource<string> = {
  key: 'system',
  script: 'uname -sm',
  parse: (output) => {
    const system = output.trim();
    if (system === '') throw new Error('uname printed nothing');
    return system;
  },
};
