import { CancelledError, type CancelSignal, type Clock } from '../hosts/cancellation';
import { throwIfAborted } from './abortable';
import {
  MAXIMUM_TERMINALS_PER_HOST,
  RetentionFailure,
  type RetentionKey,
  TerminalRetentionBudget,
} from './retention-budget';
import { type ShellTerminalIdentity, ShellTerminalStore } from './shell-store';
import type { TerminalSessionRunner } from './types';

export const DEFAULT_IDLE_TIMEOUT_MS = 300_000;

export interface PoolEntry {
  readonly store: ShellTerminalStore;
  readonly retentionId: string;
}

interface InternalEntry extends PoolEntry {
  readonly lifetime: { retained: boolean };
  ownerId: string | null;
  ownerSceneId: string | null;
  isPresented: (() => boolean) | null;
  selectionId: number;
  idleSince: number | null;
  idleId: number | null;
  expiry: unknown;
}

export interface SelectOptions {
  readonly hostId: string;
  readonly identity: ShellTerminalIdentity;
  readonly ownerId: string;
  /** The owner's window: a screen in the same window may take a terminal over. */
  readonly sceneId?: string;
  readonly generation: number | null;
  readonly isPresented?: () => boolean;
  readonly runTerminal: TerminalSessionRunner;
  readonly signal?: CancelSignal;
}

export type ReclaimOptions = Omit<SelectOptions, 'runTerminal' | 'signal'>;

export interface TerminalConnectionPoolOptions {
  readonly clock: Clock;
  readonly idleTimeoutMs?: number;
  readonly maximumShellsPerHost?: number;
  readonly budget?: TerminalRetentionBudget;
}

const keyOf = (hostId: string, identity: ShellTerminalIdentity) =>
  `${hostId}\u0000${identity.terminalId}`;
const isVisible = (entry: InternalEntry) =>
  entry.ownerId !== null && (entry.isPresented?.() ?? false);

let retentionCounter = 0;

/**
 * Retains lazily opened shell PTYs across destination changes, sharing the per-Host five
 * terminal budget with retained Agent attach. Mutations serialize through teardown, so
 * eviction never temporarily exceeds the budget. (Swift `TerminalConnectionPool`.)
 */
export class TerminalConnectionPool {
  readonly budget: TerminalRetentionBudget;
  private readonly entries = new Map<string, { hostId: string; entry: InternalEntry }>();
  private readonly clock: Clock;
  private readonly idleTimeoutMs: number;
  private readonly maximumShellsPerHost: number;
  private tail: Promise<void> = Promise.resolve();
  private selections = 0;
  private readonly listeners = new Set<() => void>();

  constructor(options: TerminalConnectionPoolOptions) {
    this.clock = options.clock;
    this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    this.maximumShellsPerHost = Math.max(
      1,
      Math.min(
        options.maximumShellsPerHost ?? MAXIMUM_TERMINALS_PER_HOST,
        MAXIMUM_TERMINALS_PER_HOST,
      ),
    );
    this.budget = options.budget ?? new TerminalRetentionBudget();
  }

  get size(): number {
    return this.entries.size;
  }

  has(hostId: string, identity: ShellTerminalIdentity): boolean {
    return this.entries.has(keyOf(hostId, identity));
  }

  entry(hostId: string, identity: ShellTerminalIdentity): PoolEntry | undefined {
    return this.entries.get(keyOf(hostId, identity))?.entry;
  }

  /** Retained shell identities of a Host, for the Terminals list. */
  retained(hostId: string): ShellTerminalIdentity[] {
    return [...this.entries.values()]
      .filter((item) => item.hostId === hostId)
      .map((item) => item.entry.store.identity);
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * The existing renderer and PTY for a target, or a created, unstarted pipeline; its first
   * layout supplies the size and opens SSH. Throws `RetentionFailure` when another window shows
   * it or every slot is visible.
   */
  async select(options: SelectOptions): Promise<PoolEntry> {
    this.selections += 1;
    const selectionId = this.selections;
    const { signal } = options;
    const entry = await this.mutate(async () => {
      throwIfAborted(signal);
      return this.selectInOrder(options, selectionId);
    });
    if (signal?.aborted) {
      if (entry.selectionId === selectionId) {
        this.release(options.hostId, options.identity, options.ownerId);
      }
      throw new CancelledError();
    }
    return entry;
  }

  private async selectInOrder(options: SelectOptions, selectionId: number): Promise<InternalEntry> {
    const { hostId, identity, ownerId, sceneId, generation, signal } = options;
    const key = keyOf(hostId, identity);
    const existing = this.entries.get(key)?.entry;
    if (existing) {
      if (!this.mayClaim(existing, ownerId, sceneId)) throw new RetentionFailure('alreadyVisible');
      this.claim(existing, { ...options, key }, selectionId);
      return existing;
    }
    while (this.countOn(hostId) >= this.maximumShellsPerHost) {
      const candidate = this.leastRecentIdle(hostId);
      if (!candidate) throw new RetentionFailure('allConnectionsVisible');
      await this.removeEntry(candidate);
      throwIfAborted(signal);
    }
    const presented = options.isPresented ?? (() => true);
    retentionCounter += 1;
    const lifetime = { retained: true };
    const store = new ShellTerminalStore({
      identity,
      transportGeneration: generation,
      takeover: false,
      isOnStage: () => lifetime.retained,
      runTerminal: options.runTerminal,
    });
    const entry: InternalEntry = {
      store,
      lifetime,
      retentionId: `shell-${retentionCounter}`,
      ownerId,
      ownerSceneId: sceneId ?? null,
      isPresented: presented,
      selectionId,
      idleSince: null,
      idleId: null,
      expiry: null,
    };
    this.entries.set(key, { hostId, entry });
    this.notify();
    try {
      await this.budget.admit({
        key: this.retentionKey(hostId, identity),
        ownerId: entry.retentionId,
        isVisible: () => isVisible(entry),
        onEvict: async () => {
          if (this.entries.get(key)?.entry === entry) await this.removeEntry(entry, key, hostId);
        },
      });
      throwIfAborted(signal);
      return entry;
    } catch (error) {
      await this.removeEntry(entry, key, hostId);
      throw error;
    }
  }

  /**
   * Claims a pooled pipeline at once for an owner coming back, so a returning screen draws the
   * terminal from its first frame. Undefined when nothing is pooled or another owner holds it.
   */
  reclaim(options: ReclaimOptions): PoolEntry | undefined {
    const key = keyOf(options.hostId, options.identity);
    const entry = this.entries.get(key)?.entry;
    if (!entry || !this.mayClaim(entry, options.ownerId, options.sceneId)) return undefined;
    this.selections += 1;
    this.claim(entry, { ...options, key }, this.selections);
    return entry;
  }

  /**
   * Another window's screen may not take a terminal it shows. A screen in the owner's own window
   * may: the owner is a screen the navigator replaced, whose late release (keyed to its own
   * owner id) then finds nothing to undo.
   */
  private mayClaim(entry: InternalEntry, ownerId: string, sceneId: string | undefined): boolean {
    if (entry.ownerId === null || entry.ownerId === ownerId) return true;
    return sceneId !== undefined && entry.ownerSceneId === sceneId;
  }

  private claim(
    entry: InternalEntry,
    options: ReclaimOptions & { key: string },
    selectionId: number,
  ): void {
    if (entry.expiry !== null) this.clock.clearTimeout(entry.expiry);
    entry.expiry = null;
    entry.ownerId = options.ownerId;
    entry.ownerSceneId = options.sceneId ?? null;
    entry.selectionId = selectionId;
    entry.isPresented = options.isPresented ?? (() => true);
    entry.idleSince = null;
    entry.idleId = null;
    this.budget.touch(this.retentionKey(options.hostId, options.identity), entry.retentionId);
    entry.store.transportGenerationDidChange(options.generation);
  }

  /** Deselecting stops accepting input but keeps the renderer and live output until expiry. */
  release(hostId: string, identity: ShellTerminalIdentity, ownerId: string): void {
    const key = keyOf(hostId, identity);
    const entry = this.entries.get(key)?.entry;
    if (!entry || entry.ownerId !== ownerId) return;
    entry.ownerId = null;
    entry.ownerSceneId = null;
    entry.isPresented = null;
    entry.idleSince = this.clock.monotonicMs();
    this.idleCounter += 1;
    const idleId = this.idleCounter;
    entry.idleId = idleId;
    this.budget.markIdle(this.retentionKey(hostId, identity), entry.retentionId);
    if (entry.expiry !== null) this.clock.clearTimeout(entry.expiry);
    entry.expiry = this.clock.setTimeout(() => {
      void this.mutate(async () => {
        if (
          entry.ownerId === null &&
          entry.idleId === idleId &&
          this.entries.get(key)?.entry === entry
        ) {
          await this.removeEntry(entry, key, hostId);
        }
      });
    }, this.idleTimeoutMs);
  }
  private idleCounter = 0;

  async remove(hostId: string, identity: ShellTerminalIdentity): Promise<void> {
    await this.mutate(async () => {
      const found = this.entries.get(keyOf(hostId, identity));
      if (found) await this.removeEntry(found.entry);
    });
  }

  async removeHost(hostId: string): Promise<void> {
    await this.mutate(async () => {
      for (const found of [...this.entries.values()]) {
        if (found.hostId === hostId) await this.removeEntry(found.entry);
      }
    });
  }

  /** The app is suspending: every pipeline ends. */
  async suspend(): Promise<void> {
    await this.mutate(async () => {
      for (const found of [...this.entries.values()]) await this.removeEntry(found.entry);
    });
  }

  /** Discards idle pipelines from an obsolete transport; a visible one recovers in place. */
  async transportGenerationDidChange(
    generation: number | null,
    hostId: string,
    isCurrent: () => boolean = () => true,
  ): Promise<void> {
    await this.mutate(async () => {
      if (!isCurrent()) return;
      for (const found of [...this.entries.values()].filter((item) => item.hostId === hostId)) {
        if (!isCurrent()) return;
        if (!this.has(hostId, found.entry.store.identity)) continue;
        if (found.entry.ownerId === null) await this.removeEntry(found.entry);
        else found.entry.store.transportGenerationDidChange(generation);
      }
    });
  }

  /** Reconcile only with an authoritative snapshot from the current Host. */
  async reconcile(
    hostId: string,
    identities: ReadonlySet<string>,
    isCurrent: () => boolean = () => true,
  ): Promise<void> {
    await this.mutate(async () => {
      if (!isCurrent()) return;
      for (const found of [...this.entries.values()]) {
        if (found.hostId !== hostId || identities.has(found.entry.store.identity.terminalId))
          continue;
        if (!isCurrent()) return;
        await this.removeEntry(found.entry);
      }
    });
  }

  async expireIdle(): Promise<void> {
    await this.mutate(async () => {
      const cutoff = this.clock.monotonicMs() - this.idleTimeoutMs;
      for (const found of [...this.entries.values()]) {
        const { entry } = found;
        if (entry.ownerId === null && entry.idleSince !== null && entry.idleSince <= cutoff) {
          await this.removeEntry(entry);
        }
      }
    });
  }

  private async removeEntry(entry: InternalEntry, knownKey?: string, knownHost?: string) {
    const found = [...this.entries.entries()].find(([, item]) => item.entry === entry);
    const key = knownKey ?? found?.[0];
    const hostId = knownHost ?? found?.[1].hostId;
    if (key === undefined || hostId === undefined || this.entries.get(key)?.entry !== entry) return;
    this.entries.delete(key);
    if (entry.expiry !== null) this.clock.clearTimeout(entry.expiry);
    entry.lifetime.retained = false;
    entry.isPresented = null;
    await entry.store.leave();
    this.budget.remove(this.retentionKey(hostId, entry.store.identity), entry.retentionId);
    this.notify();
  }

  private countOn(hostId: string): number {
    let count = 0;
    for (const item of this.entries.values()) if (item.hostId === hostId) count += 1;
    return count;
  }

  private leastRecentIdle(hostId: string): InternalEntry | undefined {
    let best: InternalEntry | undefined;
    for (const item of this.entries.values()) {
      if (item.hostId !== hostId || isVisible(item.entry)) continue;
      const since = item.entry.idleSince ?? Number.POSITIVE_INFINITY;
      if (!best || since < (best.idleSince ?? Number.POSITIVE_INFINITY)) best = item.entry;
    }
    return best;
  }

  private retentionKey(hostId: string, identity: ShellTerminalIdentity): RetentionKey {
    return { hostId, terminalId: identity.terminalId };
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }

  /** Runs after every earlier mutation, including its teardown. */
  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    const task = previous.then(operation);
    this.tail = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }
}
