import type { Message } from '../errors/text';
import type { Clock } from '../hosts/cancellation';
import type { KeyValueStorage } from '../hosts/known-hosts';
import { isPluginFeatureSupported, type PluginVersion } from '../hosts/plugin-version';
import {
  featureRequirementNote,
  readUsage,
  type UsageHostPort,
  usageFailureState,
} from './host-port';
import { claudeProgram, withClaudeLimits } from './report';
import type { HostReading, UsageHostState } from './scope';

/** The re-query cadence while the plugin's worker is refreshing. */
export const USAGE_POLL_MS = 3_000;
/** A failed refresh of a shown report backs off, doubling from the poll cadence up to this. */
export const USAGE_MAX_RETRY_MS = 30_000;
/** A report older than this is read again when a surface asks for fresh data. */
export const USAGE_STALE_MS = 15 * 60_000;

export const claudeLimitsKey = (hostId: string) => `usage.claude-limits.${hostId}`;

export interface UsageHostStoreOptions {
  readonly hostId: string;
  readonly clock: Clock;
  readonly storage: KeyValueStorage;
  /** The zone the plugin buckets days in. */
  readonly timeZone?: () => string;
  /** Wall-clock milliseconds, for "read at". */
  readonly wallNow?: () => number;
}

export interface UsageHostSnapshot {
  readonly state: UsageHostState;
  /** Why the last refresh failed while the earlier report stays shown. */
  readonly refreshFailure: string | null;
  readonly isRetryingRefresh: boolean;
  readonly isLoading: boolean;
  readonly readAt: number | null;
  readonly pluginVersion: PluginVersion | null;
  readonly claudeLimitsEnabled: boolean;
}

const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/**
 * One Host's on-demand Usage reading (Swift `AgentUsageStore`): reads over the Host's port,
 * keeps polling while the plugin's worker refreshes, backs off a failed refresh without
 * discarding the report on screen, and keeps the device's Claude Code limits consent.
 */
export class UsageHostStore {
  private port: UsageHostPort | null = null;
  private shown: UsageHostState = { kind: 'idle' };
  private includesClaudeLimits = false;
  private failure: string | null = null;
  private readAtMs: number | null = null;
  private version: PluginVersion | null = null;
  private loading = false;
  private claudeLimits: boolean;
  private request = 0;
  private lastRead: number | null = null;
  private failures = 0;
  private pause: { handle: unknown; wake: () => void } | null = null;
  private waiters: Array<() => void> = [];
  private snapshot: UsageHostSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly options: UsageHostStoreOptions) {
    this.claudeLimits = options.storage.getString(claudeLimitsKey(options.hostId)) === 'true';
    this.snapshot = this.compute();
  }

  readonly getSnapshot = (): UsageHostSnapshot => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Swaps the Host's connection; a Host that just became usable retries a failed read at once. */
  setPort(port: UsageHostPort | null): void {
    const regained = this.port === null && port !== null;
    this.port = port;
    if (regained) this.connectionBecameUsable();
  }

  get isConnected(): boolean {
    return this.port !== null;
  }

  /** The reading as the Usage screens consume it. */
  reading(id: string, name: string): HostReading {
    const { state, refreshFailure, isRetryingRefresh } = this.snapshot;
    return { id, name, state, refreshFailure, isRetryingRefresh, isConnected: this.isConnected };
  }

  get claudeLimitsEnabled(): boolean {
    return this.claudeLimits;
  }

  setClaudeLimits(enabled: boolean): void {
    if (enabled === this.claudeLimits) return;
    this.claudeLimits = enabled;
    this.options.storage.set(claudeLimitsKey(this.options.hostId), String(enabled));
    this.endRefresh();
    this.notify();
  }

  /** Whether the plugin reports Claude Code Accounts: from the last read, else the report. */
  get supportsClaudeAccounts(): boolean {
    if (this.version) return isPluginFeatureSupported('claudeAccounts', this.version);
    const report = this.shown.kind === 'available' ? this.shown.report : null;
    return report !== null && claudeProgram(report)?.accounts != null;
  }

  /** The Accounts entry's note when the plugin is too old; null when new enough or unknown. */
  get claudeAccountsRequirement(): Message | null {
    const { version } = this;
    if (!version || isPluginFeatureSupported('claudeAccounts', version)) return null;
    return featureRequirementNote('claudeAccounts', version);
  }

  /** The Default Account's directory in the shown report, which cannot be added again. */
  get defaultAccountDirectory(): string | null {
    if (this.shown.kind !== 'available') return null;
    const accounts = claudeProgram(this.shown.report)?.accounts ?? [];
    return accounts.find((account) => account.isDefault)?.directory ?? null;
  }

  /**
   * Reads, then keeps reading while the plugin's worker is refreshing or a failed refresh of a
   * shown report is retried. A newer refresh supersedes this one.
   */
  async refresh(): Promise<void> {
    const id = this.begin();
    try {
      const interval = this.pollingInterval();
      if (this.failure === null && interval !== null && this.lastRead !== null) {
        const remaining = interval - (this.options.clock.monotonicMs() - this.lastRead);
        if (remaining > 0) await this.sleep(remaining);
      }
      while (this.request === id) {
        const applied = await this.readOnce(id);
        const next = this.pollingInterval();
        if (!applied || next === null) return;
        await this.sleep(next);
      }
    } finally {
      this.finish(id);
    }
  }

  /** One read for a pull; a refreshing answer carries on polling in the background. */
  async pullToRefresh(): Promise<void> {
    if (this.request !== 0) {
      this.pause?.wake();
      await new Promise<void>((resolve) => this.waiters.push(resolve));
      return;
    }
    const id = this.begin();
    let polling = false;
    try {
      polling = (await this.readOnce(id)) && this.pollingInterval() !== null;
    } finally {
      this.finish(id);
    }
    if (polling) void this.refresh();
  }

  /** Reads again when nothing was read yet or the report is older than `USAGE_STALE_MS`. */
  async refreshIfStale(): Promise<void> {
    if (this.request !== 0 || this.port === null) return;
    const age =
      this.lastRead === null ? Infinity : this.options.clock.monotonicMs() - this.lastRead;
    if (this.shown.kind === 'idle' || age >= USAGE_STALE_MS) await this.refresh();
  }

  /** The Host's connection is usable again: retry a failed refresh now, not at its backoff end. */
  connectionBecameUsable(): void {
    const failed = this.shown.kind === 'failed' || this.failure !== null;
    if (!failed) return;
    this.lastRead = null;
    if (this.request !== 0) this.pause?.wake();
    else void this.refresh();
  }

  /** One read right after the Account file changed; it supersedes a read that may predate it. */
  async readAfterAccountChange(): Promise<void> {
    this.pause?.wake();
    const id = this.begin();
    let polling = false;
    try {
      polling = (await this.readOnce(id)) && this.pollingInterval() !== null;
    } finally {
      this.finish(id);
    }
    if (polling) void this.refresh();
  }

  /** Stops polling (the surface left). The shown report stays. */
  stop(): void {
    this.endRefresh();
    this.notify();
  }

  invalidate(): void {
    this.endRefresh();
    this.shown = { kind: 'idle' };
    this.includesClaudeLimits = false;
    this.failure = null;
    this.readAtMs = null;
    this.version = null;
    this.failures = 0;
    this.notify();
  }

  private begin(): number {
    this.request += 1;
    this.loading = true;
    if (this.shown.kind === 'idle') this.shown = { kind: 'loading' };
    this.notify();
    return this.request;
  }

  private finish(id: number): void {
    if (this.request !== id) return;
    this.request = 0;
    this.loading = false;
    this.resumeWaiters();
    this.notify();
  }

  private endRefresh(): void {
    this.request = 0;
    this.loading = false;
    this.lastRead = null;
    this.pause?.wake();
    this.resumeWaiters();
  }

  private async readOnce(id: number): Promise<boolean> {
    const claudeLimits = this.claudeLimits;
    let next: UsageHostState;
    let pluginVersion: PluginVersion | null = null;
    try {
      if (!this.port) throw new Error('not connected');
      const read = await readUsage(this.port, {
        timeZone: (this.options.timeZone ?? deviceZone)(),
        claudeLimits,
      });
      next = read.state;
      pluginVersion = read.pluginVersion;
    } catch (error) {
      next = usageFailureState(error);
    }
    if (this.request !== id) return false;
    this.lastRead = this.options.clock.monotonicMs();
    if (next.kind === 'failed' && this.shown.kind === 'available') {
      // A transient failure must not discard the report on screen.
      this.failure = next.detail;
      this.failures += 1;
    } else {
      this.shown = next;
      this.includesClaudeLimits = claudeLimits;
      this.version = pluginVersion;
      this.failure = null;
      this.readAtMs = (this.options.wallNow ?? Date.now)();
      this.failures = 0;
    }
    this.resumeWaiters();
    this.notify();
    return true;
  }

  /** Polling continues while the shown report is refreshing; a failed refresh backs off. */
  private pollingInterval(): number | null {
    if (this.shown.kind !== 'available' || this.shown.report.refreshing !== true) return null;
    if (this.failure === null) return USAGE_POLL_MS;
    const doublings = Math.min(Math.max(this.failures - 1, 0), 4);
    return Math.min(USAGE_POLL_MS * 2 ** doublings, USAGE_MAX_RETRY_MS);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        if (this.pause?.handle === handle) this.pause = null;
        this.options.clock.clearTimeout(handle);
        resolve();
      };
      const handle = this.options.clock.setTimeout(done, ms);
      this.pause = { handle, wake: done };
    });
  }

  private resumeWaiters(): void {
    const waiting = this.waiters;
    this.waiters = [];
    for (const resolve of waiting) resolve();
  }

  private compute(): UsageHostSnapshot {
    let { shown } = this;
    if (shown.kind === 'available') {
      const report = shown.report;
      if (!this.claudeLimits) {
        shown = { kind: 'available', report: withClaudeLimits(report, 'disabled', null) };
      } else if (!this.includesClaudeLimits) {
        // The toggle turned on after this report: its off reading is not this device's choice.
        shown = {
          kind: 'available',
          report:
            this.failure === null
              ? withClaudeLimits(report, 'unavailable', 'notReadYet')
              : withClaudeLimits(report, 'error', 'requestFailed'),
        };
      }
    }
    return {
      state: shown,
      refreshFailure: this.failure,
      isRetryingRefresh: this.failure !== null && this.pollingInterval() !== null,
      isLoading: this.loading,
      readAt: this.readAtMs,
      pluginVersion: this.version,
      claudeLimitsEnabled: this.claudeLimits,
    };
  }

  private notify(): void {
    this.snapshot = this.compute();
    for (const listener of [...this.listeners]) listener();
  }
}
