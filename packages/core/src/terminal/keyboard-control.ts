import { utf8Encode } from '../pairing/bytes';
import { encodeQuickKey } from './key-encoding';
import {
  type KeyModifiers,
  type Modifier,
  NO_MODIFIERS,
  type QuickKey,
  unionModifiers,
  withModifier,
} from './quick-keys';

/** A modifier as the toolbar shows it: off, armed for the next key, or locked on (Swift `TerminalModifierLatch`). */
export type ModifierLatch = 'off' | 'armed' | 'locked';

export interface KeyboardSnapshot {
  readonly pending: KeyModifiers;
  readonly locked: KeyModifiers;
}

export interface KeyboardControlOptions {
  /** Writes bytes to the live session; false when nothing was sent (no session). */
  readonly send: (bytes: Uint8Array) => boolean;
  /** Reads DECCKM from the terminal; false until the view reports it. */
  readonly applicationCursor?: () => boolean;
}

/**
 * Sticky modifiers and quick-key sending for the toolbars and the full keyboard (Swift
 * `TerminalKeyboardControl`). Tapping a modifier arms it for the next key only; firing any key
 * consumes it, except a locked one (the toolbar's Ctrl, on a long press).
 */
export class TerminalKeyboardControl {
  private snapshot: KeyboardSnapshot = { pending: NO_MODIFIERS, locked: NO_MODIFIERS };
  private readonly listeners = new Set<() => void>();

  constructor(private readonly options: KeyboardControlOptions) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  readonly getSnapshot = (): KeyboardSnapshot => this.snapshot;

  private set(next: KeyboardSnapshot): void {
    this.snapshot = next;
    for (const listener of [...this.listeners]) listener();
  }

  latch(modifier: Modifier): ModifierLatch {
    if (this.snapshot.locked[modifier]) return 'locked';
    return this.snapshot.pending[modifier] ? 'armed' : 'off';
  }

  setModifierArmed(modifier: Modifier, armed: boolean): void {
    const { pending, locked } = this.snapshot;
    this.set({
      pending: withModifier(pending, modifier, armed),
      // Disarming also unlocks.
      locked: armed ? locked : withModifier(locked, modifier, false),
    });
  }

  toggleModifier(modifier: Modifier): void {
    this.setModifierArmed(modifier, !this.snapshot.pending[modifier]);
  }

  lockModifier(modifier: Modifier): void {
    this.set({
      pending: withModifier(this.snapshot.pending, modifier, true),
      locked: withModifier(this.snapshot.locked, modifier, true),
    });
  }

  /** Sends `key` with the armed modifiers plus any physical ones; consumes the armed ones. */
  sendQuickKey(key: QuickKey, physical: KeyModifiers = NO_MODIFIERS): boolean {
    const modifiers = unionModifiers(this.snapshot.pending, physical);
    const bytes = encodeQuickKey(key, modifiers, {
      applicationCursor: this.options.applicationCursor?.() ?? false,
    });
    if (!bytes || !this.options.send(bytes)) return false;
    this.consume();
    return true;
  }

  /** Ctrl-C. Releases one-shot modifiers like any key. */
  sendInterrupt(): boolean {
    this.consume();
    const bytes = encodeQuickKey({ character: 'c' }, { ...NO_MODIFIERS, control: true });
    return bytes !== null && this.options.send(bytes);
  }

  /**
   * Text typed on the system keyboard: with a modifier armed, a single character goes out as
   * that key combination (Ctrl+C from the on-screen Ctrl), anything longer goes through raw.
   */
  typed(data: string): boolean {
    const { pending } = this.snapshot;
    const armed = pending.control || pending.option;
    if (armed && [...data].length === 1) {
      const bytes = encodeQuickKey({ character: data }, pending);
      if (bytes && this.options.send(bytes)) {
        this.consume();
        return true;
      }
    }
    return this.options.send(utf8Encode(data));
  }

  private consume(): void {
    const { pending, locked } = this.snapshot;
    if (pending === locked) return;
    this.set({ pending: locked, locked });
  }
}
