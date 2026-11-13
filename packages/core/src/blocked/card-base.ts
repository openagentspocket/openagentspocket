import type { ChatProgram } from '../chat/model/types';
import { type Sleep, sleep } from '../events/clock';
import type { Clock } from '../hosts/cancellation';
import {
  type BlockedCardState,
  type BlockedScreenIO,
  type CardContent,
  type CardTiming,
  DEFAULT_TIMING,
  INITIAL_CARD_STATE,
} from './card-support';
import { type DialogObservation, type ObservedActivity, observeDialog } from './observation';
import type { BlockedDialog } from './types';

export interface BlockedCardOptions {
  readonly program: ChatProgram;
  readonly io: BlockedScreenIO;
  readonly clock: Clock;
  readonly timing?: Partial<CardTiming>;
  /**
   * The transcript request's `tool_use` id for a dialog, ahead of the request `setCalls` matches
   * it to (`matchedRequest`); null falls back to that match. For tests that script the id.
   */
  readonly toolUseIdFor?: (dialog: BlockedDialog) => string | null;
}

/** One running watch loop. */
export interface Watcher {
  stopped: boolean;
  nap: Sleep | null;
}

/** The observable state, the clock and the pane reads a card's store builds on. */
export abstract class CardBase {
  protected state: BlockedCardState = INITIAL_CARD_STATE;
  protected readonly listeners = new Set<() => void>();
  protected readonly timing: CardTiming;
  protected activity: ObservedActivity = 'unknown';
  protected resolved: ReadonlySet<string> = new Set();
  protected ended = false;
  protected visible = false;
  private suspended = false;
  private watcher: Watcher | null = null;

  constructor(protected readonly options: BlockedCardOptions) {
    this.timing = { ...DEFAULT_TIMING, ...options.timing };
  }

  readonly getState = (): BlockedCardState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Whether the screen may show a dialog the card answers. */
  protected abstract get readsScreen(): boolean;

  /** One watch read. */
  abstract refresh(): Promise<void>;

  show(): void {
    this.visible = true;
    this.updateWatching();
  }

  hide(): void {
    this.visible = false;
    this.updateWatching();
  }

  suspend(): void {
    this.suspended = true;
    this.updateWatching();
  }

  resume(): void {
    this.suspended = false;
    this.updateWatching();
  }

  protected updateWatching(): void {
    const should = this.visible && !this.suspended && this.readsScreen;
    if (should && !this.watcher) {
      const watcher: Watcher = { stopped: false, nap: null };
      this.watcher = watcher;
      void this.watch(watcher);
    } else if (!should && this.watcher) {
      this.watcher.stopped = true;
      this.watcher.nap?.cancel();
      this.watcher = null;
    }
  }

  private async watch(watcher: Watcher): Promise<void> {
    while (!watcher.stopped) {
      await this.refresh();
      if (watcher.stopped) return;
      watcher.nap = sleep(this.options.clock, this.timing.watchMs);
      await watcher.nap.done;
    }
  }

  /** Reads until `isMet` holds or the window closes, with the last read. */
  protected async poll(
    windowMs: number,
    isMet: (observation: DialogObservation) => boolean,
  ): Promise<{ isMet: boolean; last: DialogObservation | null }> {
    const deadline = this.now() + windowMs;
    let last: DialogObservation | null = null;
    for (;;) {
      const observation = await this.observe();
      if (observation) {
        last = observation;
        if (isMet(observation)) return { isMet: true, last: observation };
      }
      if (this.now() >= deadline || this.ended) return { isMet: false, last };
      await this.pause(this.timing.pollMs);
    }
  }

  protected async observe(): Promise<DialogObservation | null> {
    let screen: Awaited<ReturnType<BlockedScreenIO['readScreen']>>;
    try {
      screen = await this.options.io.readScreen();
    } catch {
      return null;
    }
    return observeDialog(screen, this.options.program, this.activity, this.resolved);
  }

  protected now(): number {
    return this.options.clock.monotonicMs();
  }

  protected pause(ms: number): Promise<void> {
    return sleep(this.options.clock, ms).done;
  }

  protected patch(next: Partial<BlockedCardState>): void {
    const merged = { ...this.state, ...next };
    const changed = (Object.keys(merged) as (keyof BlockedCardState)[]).some((key) =>
      key === 'content'
        ? contentSignature(merged.content) !== contentSignature(this.state.content)
        : merged[key] !== this.state[key],
    );
    if (!changed) return;
    this.state = merged;
    for (const listener of [...this.listeners]) listener();
  }
}

function contentSignature(content: CardContent): string {
  return JSON.stringify(content, (_key, value) => (value instanceof Map ? [...value] : value));
}
