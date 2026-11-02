import { decodeUtf8 } from '../events/utf8';

const MAXIMUM_RETAINED_BYTES = 4 * 1024;
const MAXIMUM_LINE_LENGTH = 120;
/** Longest escape sequence held back while waiting for the rest of a split mode switch. */
const MAXIMUM_CARRIED_BYTES = 32;
const ESC = 0x1b;

type ModeSwitchScan =
  | { kind: 'incomplete' }
  | { kind: 'none' }
  | { kind: 'switch'; entersAlternateScreen: boolean | null; end: number };

/** Recognizes `ESC [ ? Pm h` and `ESC [ ? Pm l` at `start`; modes 1049, 1047 and 47 are the alt screen. */
function modeSwitch(bytes: readonly number[], start: number): ModeSwitchScan {
  const introducer = [ESC, 0x5b, 0x3f];
  for (let offset = 1; offset < introducer.length; offset += 1) {
    if (start + offset >= bytes.length) {
      return bytes.length - start <= MAXIMUM_CARRIED_BYTES
        ? { kind: 'incomplete' }
        : { kind: 'none' };
    }
    if (bytes[start + offset] !== introducer[offset]) return { kind: 'none' };
  }
  let index = start + introducer.length;
  const parameters: number[] = [];
  let current = 0;
  while (index < bytes.length) {
    const byte = bytes[index] as number;
    if (byte >= 0x30 && byte <= 0x39) {
      current = Math.min(current * 10 + (byte - 0x30), 100_000);
    } else if (byte === 0x3b) {
      parameters.push(current);
      current = 0;
    } else if (byte === 0x68 || byte === 0x6c) {
      parameters.push(current);
      const switches = parameters.some((value) => value === 1049 || value === 1047 || value === 47);
      return {
        kind: 'switch',
        entersAlternateScreen: switches ? byte === 0x68 : null,
        end: index + 1,
      };
    } else {
      return { kind: 'none' };
    }
    index += 1;
    if (index - start > MAXIMUM_CARRIED_BYTES) return { kind: 'none' };
  }
  return { kind: 'incomplete' };
}

function isBidiFormatting(value: number): boolean {
  return (
    value === 0x200e ||
    value === 0x200f ||
    value === 0x061c ||
    (value >= 0x202a && value <= 0x202e) ||
    (value >= 0x2066 && value <= 0x2069)
  );
}

type SanitizeState =
  | 'text'
  | 'escape'
  | 'escapeIntermediate'
  | 'controlSequence'
  | 'controlString'
  | 'controlStringEscape';

/** Removes escape sequences, control characters and bidirectional formatting, keeping breaks and tabs. */
function sanitized(text: string): string {
  let out = '';
  let state: SanitizeState = 'text';
  for (const char of text) {
    const value = char.codePointAt(0) as number;
    switch (state) {
      case 'text':
        if (value === ESC) state = 'escape';
        else if (value === 0x0a || value === 0x0d || value === 0x09) out += char;
        else if (value < 0x20 || (value >= 0x7f && value <= 0x9f) || isBidiFormatting(value)) {
          // dropped
        } else out += char;
        break;
      case 'escape':
        if (value === 0x5b) state = 'controlSequence';
        else if ([0x5d, 0x50, 0x58, 0x5e, 0x5f].includes(value)) state = 'controlString';
        else if (value >= 0x20 && value <= 0x2f) state = 'escapeIntermediate';
        else if (value !== ESC) state = 'text';
        break;
      case 'escapeIntermediate':
        if (!(value >= 0x20 && value <= 0x2f)) state = 'text';
        break;
      case 'controlSequence':
        if (value >= 0x40 && value <= 0x7e) state = 'text';
        else if (value === ESC) state = 'escape';
        else if (value === 0x0a || value === 0x0d) {
          out += char;
          state = 'text';
        }
        break;
      case 'controlString':
        if (value === 0x07) state = 'text';
        else if (value === ESC) state = 'controlStringEscape';
        break;
      case 'controlStringEscape':
        if (value === 0x5c) state = 'text';
        else if (value !== ESC) state = 'controlString';
        break;
    }
  }
  return out;
}

function isHint(line: string): boolean {
  const lowered = line.toLowerCase();
  return lowered.startsWith('note:') || lowered.startsWith('for more information');
}

/** Picks the line to quote from command output already decoded as text. */
export function lineFromOutput(output: string): string | null {
  const lines = sanitized(output)
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const lastWhere = (test: (line: string) => boolean) => {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (test(lines[index] as string)) return lines[index];
    }
    return undefined;
  };
  // An explicit error line beats the usage text after it: clap "error:", herdr "herdr:", Rust "Error:".
  const chosen =
    lastWhere((line) => {
      const lowered = line.toLowerCase();
      return lowered.startsWith('error:') || lowered.startsWith('herdr:');
    }) ??
    lastWhere((line) => !isHint(line)) ??
    lines[lines.length - 1];
  if (chosen === undefined) return null;
  const chars = [...chosen];
  return chars.length > MAXIMUM_LINE_LENGTH
    ? `${chars.slice(0, MAXIMUM_LINE_LENGTH - 1).join('')}…`
    : chosen;
}

/**
 * The last thing an attach command said before it exited, as one line a failure message can
 * quote. Keeps a bounded tail of the output outside the alternate screen; alternate-screen
 * content (a TUI's screen, which can show secrets) is never retained. A command that exits while
 * still inside the alternate screen has no line to quote. (Swift `AttachExitDiagnostic`.)
 */
export class AttachExitDiagnostic {
  private inAlternateScreen = false;
  private retained: number[] = [];
  private truncated = false;
  private carried: number[] = [];

  record(chunk: Uint8Array): void {
    if (chunk.length === 0) return;
    const bytes = [...this.carried, ...chunk];
    this.carried = [];
    let index = 0;
    let runStart = 0;
    while (index < bytes.length) {
      if (bytes[index] !== ESC) {
        index += 1;
        continue;
      }
      const scan = modeSwitch(bytes, index);
      if (scan.kind === 'incomplete') {
        this.retain(bytes.slice(runStart, index));
        this.carried = bytes.slice(index);
        return;
      }
      if (scan.kind === 'none') {
        index += 1;
        continue;
      }
      this.retain(bytes.slice(runStart, index));
      const enters = scan.entersAlternateScreen;
      if (enters !== null) {
        if (enters !== this.inAlternateScreen) {
          this.retained = [];
          this.truncated = false;
        }
        this.inAlternateScreen = enters;
      }
      index = scan.end;
      runStart = scan.end;
    }
    this.retain(bytes.slice(runStart));
  }

  /** The line to quote, or null when the command left nothing quotable. */
  get line(): string | null {
    if (this.inAlternateScreen) return null;
    const tail = this.retained.slice(-MAXIMUM_RETAINED_BYTES);
    let text = decodeUtf8(Uint8Array.from([...tail, ...this.carried]));
    if (this.truncated || this.retained.length > MAXIMUM_RETAINED_BYTES) {
      // The first line was cut mid-way, possibly inside an escape or a UTF-8 scalar: drop it.
      const firstBreak = text.search(/[\n\r]/);
      if (firstBreak >= 0) text = text.slice(firstBreak + 1);
    }
    return lineFromOutput(text);
  }

  private retain(bytes: readonly number[]): void {
    if (this.inAlternateScreen || bytes.length === 0) return;
    for (const byte of bytes) this.retained.push(byte);
    if (this.retained.length > 2 * MAXIMUM_RETAINED_BYTES) {
      this.retained = this.retained.slice(this.retained.length - MAXIMUM_RETAINED_BYTES);
      this.truncated = true;
    }
  }
}
