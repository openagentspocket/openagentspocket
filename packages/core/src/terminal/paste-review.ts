import { pasteLineCount, pastePreview } from './paste-preview';
import { containsOnlySafeScalars, encodePaste, isMultiline } from './text-safety';

// Port of the Paste half of Swift `TerminalInputController`: text from the clipboard reaches the
// pane directly only when it is a single safe line. Multi-line text waits for the user's review
// (its newlines would otherwise act as separate Enter presses), and text carrying control bytes
// (an escape sequence is a command to the remote terminal) is rejected outright.

export interface PasteReview {
  lineCount: number;
  characterCount: number;
  /** Bounded for display; the confirmed text is never truncated. */
  preview: string;
}

export type PasteRequestResult =
  | { kind: 'inserted' }
  | { kind: 'requiresReview'; review: PasteReview }
  | { kind: 'rejected' }
  | { kind: 'blocked' };

/** Where confirmed paste bytes go: the live session's input path. */
export interface PasteWriter {
  write(bytes: Uint8Array): void;
}

export class PasteReviewer {
  private writer: PasteWriter | null = null;
  private pendingText: string | null = null;
  /** Captured at request time: the framing the user agreed to is the one true when shown. */
  private pendingBracketed = false;
  private _pending: PasteReview | null = null;
  private _blockedByUnsafeText = false;

  /** The review the sheet is showing, or null. */
  get pending(): PasteReview | null {
    return this._pending;
  }

  /** True after a paste was rejected for control characters, until cleared (the "Paste Blocked" alert). */
  get blockedByUnsafeText(): boolean {
    return this._blockedByUnsafeText;
  }

  get canConfirm(): boolean {
    return this.writer !== null && this.pendingText !== null;
  }

  /** Binds the live writer. A pending review survives a pipeline replacement (see `unbind`). */
  bind(writer: PasteWriter): void {
    this.writer = writer;
  }

  /** The session ended: a review is discarded unless the pipeline is only being replaced. */
  unbind(options: { preservingPendingPaste?: boolean } = {}): void {
    this.writer = null;
    if (!options.preservingPendingPaste) this.cancel();
  }

  request(text: string, options: { bracketedPaste?: boolean } = {}): PasteRequestResult {
    this._blockedByUnsafeText = false;
    const writer = this.writer;
    if (!writer) return { kind: 'blocked' };
    if (!containsOnlySafeScalars(text)) {
      this.cancel();
      this._blockedByUnsafeText = true;
      return { kind: 'rejected' };
    }
    if (!isMultiline(text)) {
      if (text !== '') writer.write(encodePaste(text, false));
      return { kind: 'inserted' };
    }
    const review: PasteReview = {
      lineCount: pasteLineCount(text),
      characterCount: Array.from(text).length,
      preview: pastePreview(text),
    };
    this.pendingText = text;
    this.pendingBracketed = options.bracketedPaste ?? false;
    this._pending = review;
    return { kind: 'requiresReview', review };
  }

  /** Writes the reviewed text as one framed write; false when there is no writer or no review. */
  confirm(): boolean {
    const writer = this.writer;
    const text = this.pendingText;
    if (!writer || text === null) return false;
    writer.write(encodePaste(text, this.pendingBracketed));
    this.cancel();
    return true;
  }

  cancel(): void {
    this.pendingText = null;
    this.pendingBracketed = false;
    this._pending = null;
  }

  clearBlocked(): void {
    this._blockedByUnsafeText = false;
  }
}
