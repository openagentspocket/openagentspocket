import { message, type Text } from '../errors/text';
import { utf8Encode } from '../pairing/bytes';
import type { InputSessionGeneration, TerminalInputPort } from './input-port';
import { containsOnlySafeScalars, encodePaste, isMultiline } from './text-safety';

export interface PasteReview {
  readonly lineCount: number;
  readonly characterCount: number;
  readonly preview: string;
}

export type PasteRequestResult =
  | { readonly kind: 'inserted' }
  | { readonly kind: 'requiresReview'; readonly review: PasteReview }
  | { readonly kind: 'rejected' }
  | { readonly kind: 'blocked' };

/** Where outgoing bytes came from; the message index (jump to a sent message) reads it. */
export type OutgoingSource = 'keystroke' | 'composerInsert' | 'escapeKey' | 'snippet' | 'paste';

export interface InputSnapshot {
  readonly live: boolean;
  readonly pendingPaste: PasteReview | null;
  readonly pasteError: Text | null;
}

export interface TerminalInputControllerOptions {
  /** Sees every write before it leaves, with its source. */
  readonly observeOutgoing?: (data: Uint8Array, source: OutgoingSource) => void;
  /** Called when a session begins or ends, so per-session indexes reset with the writer. */
  readonly sessionDidReset?: () => void;
}

interface Writer {
  write(data: Uint8Array): void;
  scroll(sequence: Uint8Array, rows: number): void;
}

const PREVIEW_LIMIT = 2000;
const UNSAFE_PASTE = message('The clipboard contains unsafe terminal control characters.');

/** Lines in `text`: CRLF counts once, a lone CR or LF starts a line. */
export function lineCount(text: string): number {
  let count = 1;
  let previousWasCR = false;
  for (const char of text) {
    if (char === '\n') {
      if (!previousWasCR) count += 1;
    } else if (char === '\r') {
      count += 1;
    }
    previousWasCR = char === '\r';
  }
  return count;
}

const characters = (text: string): number => [...text].length;

function previewOf(text: string): string {
  const all = [...text];
  return all.length > PREVIEW_LIMIT ? `${all.slice(0, PREVIEW_LIMIT).join('')}…` : text;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point.
const hasControlOrNewline = (text: string) => /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/.test(text);

/**
 * The only application-level writer for Attach input (Swift `TerminalInputController`). Keyboard
 * input, terminal controls, reviewed Paste and Snippets all cross this boundary so session
 * ownership applies consistently.
 */
export class TerminalInputController implements TerminalInputPort {
  private generation = 0;
  private liveGeneration: InputSessionGeneration | null = null;
  private readyGeneration: InputSessionGeneration | null = null;
  private writer: Writer | null = null;
  private pendingPasteText: string | null = null;
  /** Captured at request time: the framing the user agreed to is the one they were shown. */
  private pendingPasteIsBracketed = false;
  private heldInsertion = '';
  private snapshot: InputSnapshot = { live: false, pendingPaste: null, pasteError: null };
  private readonly listeners = new Set<() => void>();

  constructor(private readonly options: TerminalInputControllerOptions = {}) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  readonly getSnapshot = (): InputSnapshot => this.snapshot;

  get pendingPaste(): PasteReview | null {
    return this.snapshot.pendingPaste;
  }
  get pasteError(): Text | null {
    return this.snapshot.pasteError;
  }
  get canConfirmPaste(): boolean {
    return this.writer !== null && this.pendingPasteText !== null;
  }
  /** Whether a live writer exists (the session may not have painted yet). */
  get hasWriter(): boolean {
    return this.writer !== null;
  }

  private publish(patch: Partial<InputSnapshot> = {}): void {
    this.snapshot = { ...this.snapshot, live: this.writer !== null, ...patch };
    for (const listener of [...this.listeners]) listener();
  }

  beginSession(writer: Writer): InputSessionGeneration {
    this.generation += 1;
    this.liveGeneration = this.generation;
    this.readyGeneration = null;
    this.writer = writer;
    this.options.sessionDidReset?.();
    this.publish();
    return this.generation;
  }

  endSession(
    generation: InputSessionGeneration,
    options: { preservingPendingPaste?: boolean } = {},
  ): void {
    if (generation !== this.liveGeneration) return;
    this.liveGeneration = null;
    this.readyGeneration = null;
    this.writer = null;
    this.options.sessionDidReset?.();
    if (options.preservingPendingPaste) this.publish();
    else this.cancelPaste();
  }

  /**
   * Removes the predecessor Attach's input capabilities when a replacement is scheduled. A
   * reviewed Paste belongs to the surrounding interaction, so it stays pending.
   */
  detachSessionForReplacement(): void {
    this.liveGeneration = null;
    this.readyGeneration = null;
    this.writer = null;
    this.options.sessionDidReset?.();
    this.publish();
  }

  sessionDidBecomeLive(generation: InputSessionGeneration): void {
    if (generation !== this.liveGeneration) return;
    this.readyGeneration = generation;
    const text = this.heldInsertion;
    this.heldInsertion = '';
    if (text) this.insertSnippet(text, false);
  }

  private emit(data: Uint8Array, source: OutgoingSource): void {
    this.options.observeOutgoing?.(data, source);
    this.writer?.write(data);
  }

  /** Sends ordinary terminal bytes; false when empty or no live session. */
  send(data: Uint8Array): boolean {
    if (!this.writer || data.length === 0) return false;
    this.emit(data, 'keystroke');
    return true;
  }

  /** Composer text into the live PTY without submitting; a later Esc cancels this pending line. */
  insertComposerDraft(text: string): boolean {
    if (!this.writer || !text) return false;
    this.emit(utf8Encode(text), 'composerInsert');
    return true;
  }

  /** The Esc quick key, distinct from a raw 0x1B that may start CSI/SS3. */
  sendEscapeKey(): boolean {
    if (!this.writer) return false;
    this.emit(Uint8Array.of(0x1b), 'escapeKey');
    return true;
  }

  /** Touch scrolling is separate from reliable input; the session coalesces and sheds it. */
  scroll(sequence: Uint8Array, rows: number): void {
    if (sequence.length === 0 || rows <= 0) return;
    this.writer?.scroll(sequence, rows);
  }

  /**
   * Snippet text never carries a submit byte; multiline text is framed as a paste when the remote
   * asked for it. No review: the user wrote and named this text.
   */
  insertSnippet(text: string, bracketedPaste: boolean): boolean {
    if (!this.writer || !text || !containsOnlySafeScalars(text)) return false;
    this.emit(encodePaste(text, bracketedPaste && isMultiline(text)), 'snippet');
    return true;
  }

  /**
   * A reference from Changes: held until a rebuilding Attach produces output, then typed like a
   * Snippet. A single line only, no control characters.
   */
  insertReferenceWhenLive(text: string): boolean {
    if (!text || hasControlOrNewline(text)) return false;
    if (this.readyGeneration !== null && this.readyGeneration === this.liveGeneration) {
      return this.insertSnippet(text, false);
    }
    this.heldInsertion += text;
    return true;
  }

  /** Only a departure discards held text; ending or replacing a pipeline keeps it. */
  discardHeldInsertion(): void {
    this.heldInsertion = '';
  }

  requestPaste(text: string, bracketedPaste = false): PasteRequestResult {
    this.publish({ pasteError: null });
    if (!this.writer) return { kind: 'blocked' };
    if (!containsOnlySafeScalars(text)) {
      this.cancelPaste();
      this.publish({ pasteError: UNSAFE_PASTE });
      return { kind: 'rejected' };
    }
    if (!isMultiline(text)) {
      if (text) this.emit(utf8Encode(text), 'paste');
      return { kind: 'inserted' };
    }
    const review: PasteReview = {
      lineCount: lineCount(text),
      characterCount: characters(text),
      preview: previewOf(text),
    };
    this.pendingPasteText = text;
    this.pendingPasteIsBracketed = bracketedPaste;
    this.publish({ pendingPaste: review });
    return { kind: 'requiresReview', review };
  }

  confirmPaste(): boolean {
    const text = this.pendingPasteText;
    if (!this.writer || text === null) return false;
    // Reviewed multiline text is still multiline: unframed, its newlines would arrive as keys.
    this.emit(encodePaste(text, this.pendingPasteIsBracketed), 'paste');
    this.cancelPaste();
    return true;
  }

  cancelPaste(): void {
    this.pendingPasteText = null;
    this.pendingPasteIsBracketed = false;
    this.publish({ pendingPaste: null });
  }

  clearPasteError(): void {
    this.publish({ pasteError: null });
  }
}
