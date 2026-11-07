import { utf8Encode } from '../pairing/bytes';
import type { JumpDirection } from './message-jump';

// The mouse half of Swift `TerminalModeTracker` and `TerminalMouseEncoding`: what the Attach output
// asked for, and the wheel report that answers it. The native terminal keeps its own copy of these
// modes behind a view that does not expose them, so code that scrolls from outside reads the bytes.

const ESC = 0x1b;
const WHEEL_UP = 64;
const WHEEL_DOWN = 65;
/** Legacy reports carry a cell in one byte, offset by 32. */
const LEGACY_LIMIT = 223;
const LEGACY_OFFSET = 32;
/** A real mode list is a few numbers; anything longer is not one. */
const MAXIMUM_MODE_LIST = 64;
const MOUSE_TRACKING_MODES: ReadonlySet<number> = new Set([1000, 1002, 1003]);
const SGR_ENCODING_MODE = 1006;

type ScanState = 'ground' | 'escape' | 'bracket' | 'modes';

export class TerminalMouseModes {
  private tracking = new Set<number>();
  private sgr = false;
  private state: ScanState = 'ground';
  private list = '';

  /** Output from the Attach, in order; a sequence may be split across calls. */
  receive(bytes: Uint8Array): void {
    for (const byte of bytes) this.scan(byte);
  }

  /** A new Attach starts from the terminal's defaults. */
  reset(): void {
    this.tracking = new Set();
    this.sgr = false;
    this.state = 'ground';
    this.list = '';
  }

  /** Whether the remote takes wheel reports. */
  get tracksMouse(): boolean {
    return this.tracking.size > 0;
  }

  /** One wheel notch at the grid's centre; null while the remote takes none. */
  wheelReport(direction: JumpDirection, cols: number, rows: number): Uint8Array | null {
    if (!this.tracksMouse) return null;
    const button = direction === 'older' ? WHEEL_UP : WHEEL_DOWN;
    const column = Math.max(1, Math.floor(cols / 2));
    const row = Math.max(1, Math.floor(rows / 2));
    if (this.sgr) return utf8Encode(`\u001b[<${button};${column};${row}M`);
    return Uint8Array.of(
      ESC,
      0x5b,
      0x4d,
      button + LEGACY_OFFSET,
      Math.min(column, LEGACY_LIMIT) + LEGACY_OFFSET,
      Math.min(row, LEGACY_LIMIT) + LEGACY_OFFSET,
    );
  }

  private scan(byte: number): void {
    switch (this.state) {
      case 'ground':
        if (byte === ESC) this.state = 'escape';
        return;
      case 'escape':
        this.state = byte === 0x5b ? 'bracket' : this.afterSequence(byte);
        return;
      case 'bracket':
        if (byte === 0x3f) {
          this.list = '';
          this.state = 'modes';
        } else {
          this.state = this.afterSequence(byte);
        }
        return;
      case 'modes':
        this.scanModes(byte);
        return;
    }
  }

  private scanModes(byte: number): void {
    const isListByte = (byte >= 0x30 && byte <= 0x39) || byte === 0x3b;
    if (isListByte && this.list.length < MAXIMUM_MODE_LIST) {
      this.list += String.fromCharCode(byte);
      return;
    }
    if (byte === 0x68 || byte === 0x6c) {
      for (const mode of this.list.split(';')) this.apply(Number(mode), byte === 0x68);
    }
    this.state = isListByte ? 'ground' : this.afterSequence(byte);
  }

  private afterSequence(byte: number): ScanState {
    return byte === ESC ? 'escape' : 'ground';
  }

  private apply(mode: number, enabled: boolean): void {
    if (mode === SGR_ENCODING_MODE) this.sgr = enabled;
    else if (MOUSE_TRACKING_MODES.has(mode)) {
      if (enabled) this.tracking.add(mode);
      else this.tracking.delete(mode);
    }
  }
}
