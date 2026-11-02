import { message, type Text } from '../errors/text';
import type { CancelSignal } from '../hosts/cancellation';
import { raceAbort, throwIfAborted } from './abortable';

export interface RetentionKey {
  readonly hostId: string;
  readonly terminalId: string;
}

export type RetentionFailureKind = 'alreadyVisible' | 'allConnectionsVisible';

export class RetentionFailure extends Error {
  readonly text: Text;
  constructor(readonly kind: RetentionFailureKind) {
    super(kind);
    this.name = 'RetentionFailure';
    this.text =
      kind === 'alreadyVisible'
        ? message('This terminal is already open in another window.')
        : message('Close another terminal view on this Host before opening this terminal.');
  }
}

export interface AdmitOptions {
  readonly key: RetentionKey;
  readonly ownerId: string;
  /** True while a screen shows this terminal; a visible one is never evicted. */
  readonly isVisible: () => boolean;
  /** Tears the retained terminal down; admission waits for it. */
  readonly onEvict: () => Promise<void>;
  readonly signal?: CancelSignal;
}

interface Registration {
  readonly key: RetentionKey;
  readonly ownerId: string;
  readonly isVisible: () => boolean;
  readonly onEvict: () => Promise<void>;
  recency: number;
}

/** The most terminals one Host keeps retained (shells and Agent attaches together). */
export const MAXIMUM_TERMINALS_PER_HOST = 5;

const slot = (key: RetentionKey) => `${key.hostId}\u0000${key.terminalId}`;

/**
 * One Host-wide retention budget shared by Agent and ordinary-terminal owners. Reclaiming a slot
 * waits for its PTY teardown before admission; admissions run strictly in arrival order, also
 * when a waiter was cancelled. (Swift `TerminalRetentionBudget`.)
 */
export class TerminalRetentionBudget {
  readonly maximumPerHost: number;
  private readonly registrations = new Map<string, Registration>();
  private sequence = 0;
  private tail: Promise<void> = Promise.resolve();

  constructor(maximumPerHost: number = MAXIMUM_TERMINALS_PER_HOST) {
    this.maximumPerHost = Math.max(1, Math.min(maximumPerHost, MAXIMUM_TERMINALS_PER_HOST));
  }

  async admit(options: AdmitOptions): Promise<void> {
    const { key, ownerId, signal } = options;
    throwIfAborted(signal);
    if (this.registrations.get(slot(key))?.ownerId === ownerId) {
      this.touch(key, ownerId);
      return;
    }
    const previous = this.tail;
    const task = (async () => {
      await raceAbort(previous, signal);
      throwIfAborted(signal);
      await this.admitInOrder(options);
    })();
    // A cancelled waiter returns early, but the queue behind it still waits its turn.
    this.tail = (async () => {
      await previous;
      await task.catch(() => undefined);
    })();
    await raceAbort(task, signal);
  }

  private async admitInOrder(options: AdmitOptions): Promise<void> {
    const { key, ownerId, isVisible, onEvict, signal } = options;
    const existing = this.registrations.get(slot(key));
    if (existing) {
      if (existing.ownerId === ownerId) return this.touch(key, ownerId);
      if (existing.isVisible()) throw new RetentionFailure('alreadyVisible');
      this.registrations.delete(slot(key));
      await existing.onEvict();
      throwIfAborted(signal);
    }
    while (this.countOn(key.hostId) >= this.maximumPerHost) {
      const candidate = this.leastRecentIdle(key.hostId);
      if (!candidate) throw new RetentionFailure('allConnectionsVisible');
      this.registrations.delete(slot(candidate.key));
      await candidate.onEvict();
      throwIfAborted(signal);
    }
    this.sequence += 1;
    this.registrations.set(slot(key), { key, ownerId, isVisible, onEvict, recency: this.sequence });
  }

  private countOn(hostId: string): number {
    let count = 0;
    for (const entry of this.registrations.values()) if (entry.key.hostId === hostId) count += 1;
    return count;
  }

  private leastRecentIdle(hostId: string): Registration | undefined {
    let best: Registration | undefined;
    for (const entry of this.registrations.values()) {
      if (entry.key.hostId !== hostId || entry.isVisible()) continue;
      if (!best || entry.recency < best.recency) best = entry;
    }
    return best;
  }

  touch(key: RetentionKey, ownerId: string): void {
    const entry = this.registrations.get(slot(key));
    if (entry?.ownerId !== ownerId) return;
    this.sequence += 1;
    entry.recency = this.sequence;
  }

  markIdle(key: RetentionKey, ownerId: string): void {
    this.touch(key, ownerId);
  }

  remove(key: RetentionKey, ownerId: string): void {
    if (this.registrations.get(slot(key))?.ownerId === ownerId) {
      this.registrations.delete(slot(key));
    }
  }

  /** Retained terminals on a Host. */
  count(hostId: string): number {
    return this.countOn(hostId);
  }
}
