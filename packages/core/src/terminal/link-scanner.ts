import { utf8Decode } from '../pairing/bytes';

// Port of Swift `AttachLinkScanner`, `OSC8Accumulator` and `PlainAttachLinkScanner`: finds web
// targets in a PTY byte stream across arbitrary chunk boundaries. SGR styling is transparent to
// visible URLs; other controls end a plain candidate. OSC 8 targets are collected explicitly so
// their labels cannot hide or replace the real destination. Every buffer has a hard upper bound.

export type RecordTarget = (target: string) => void;

const MAXIMUM_TARGET_BYTES = 32 * 1024;
const MAXIMUM_COMMAND_BYTES = 16;
const SCHEMES = ['http://', 'https://'].map((s) => Array.from(s, (c) => c.charCodeAt(0)));
const LONGEST_SCHEME = 8;
const TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':', '!']);
const BRACKETS: ReadonlyArray<readonly [string, string]> = [
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
];

function removingSurroundingPunctuation(text: string): string {
  const chars = Array.from(text);
  for (;;) {
    const last = chars[chars.length - 1];
    if (last === undefined) break;
    if (TRAILING_PUNCTUATION.has(last)) {
      chars.pop();
      continue;
    }
    const pair = BRACKETS.find(([, closing]) => closing === last);
    if (!pair) break;
    const opened = chars.filter((c) => c === pair[0]).length;
    const closed = chars.filter((c) => c === pair[1]).length;
    if (closed <= opened) break;
    chars.pop();
  }
  return chars.join('');
}

/** Plain web targets from printable text; actual whitespace and quotes terminate a candidate. */
class PlainScanner {
  private recent: number[] = [];
  private candidate: number[] = [];
  private oversized = false;

  receive(byte: number, record: RecordTarget): void {
    if (isBoundary(byte)) {
      const target = this.finishCandidate();
      if (target !== null) record(target);
      this.recent = [];
      return;
    }
    if (this.candidate.length > 0 || this.oversized) {
      if (this.oversized) return;
      if (this.candidate.length >= MAXIMUM_TARGET_BYTES) {
        this.candidate = [];
        this.oversized = true;
        return;
      }
      this.candidate.push(byte);
      return;
    }
    this.recent.push(byte);
    if (this.recent.length > LONGEST_SCHEME)
      this.recent.splice(0, this.recent.length - LONGEST_SCHEME);
    const scheme = SCHEMES.find((s) => this.recentEndsWith(s));
    if (!scheme) return;
    this.candidate = this.recent.slice(-scheme.length);
    this.recent = [];
  }

  finishOutput(): string | null {
    this.recent = [];
    return this.finishCandidate();
  }

  private recentEndsWith(suffix: number[]): boolean {
    if (this.recent.length < suffix.length) return false;
    const tail = this.recent.slice(-suffix.length);
    return tail.every((b, i) => (b >= 0x41 && b <= 0x5a ? b + 0x20 : b) === suffix[i]);
  }

  private finishCandidate(): string | null {
    const bytes = this.candidate;
    const oversized = this.oversized;
    this.candidate = [];
    this.oversized = false;
    if (oversized) return null;
    const text = utf8Decode(Uint8Array.from(bytes), true);
    if (text === null) return null;
    const target = removingSurroundingPunctuation(text);
    return target === '' ? null : target;
  }
}

function isBoundary(byte: number): boolean {
  return (
    byte <= 0x20 ||
    byte === 0x7f ||
    byte === 0x22 ||
    byte === 0x27 ||
    byte === 0x3c ||
    byte === 0x3e
  );
}

type Hyperlink = { kind: 'open'; target: string | null } | { kind: 'close' };

/** The command, parameters and target fields of one OSC string, kept only for `8;params;URI`. */
class Osc8Accumulator {
  private field: 'command' | 'parameters' | 'target' | 'ignored' = 'command';
  private command: number[] = [];
  private target: number[] = [];
  private oversized = false;

  get hyperlink(): Hyperlink | null {
    if (this.field !== 'target') return null;
    if (this.target.length === 0 && !this.oversized) return { kind: 'close' };
    if (this.oversized) return { kind: 'open', target: null };
    const text = utf8Decode(Uint8Array.from(this.target), true);
    return { kind: 'open', target: text };
  }

  receive(byte: number): void {
    switch (this.field) {
      case 'command':
        if (byte === 0x3b)
          this.field =
            this.command.length === 1 && this.command[0] === 0x38 ? 'parameters' : 'ignored';
        else if (this.command.length < MAXIMUM_COMMAND_BYTES) this.command.push(byte);
        else this.field = 'ignored';
        break;
      case 'parameters':
        if (byte === 0x3b) this.field = 'target';
        break;
      case 'target':
        if (this.oversized) return;
        if (this.target.length >= MAXIMUM_TARGET_BYTES) {
          this.target = [];
          this.oversized = true;
          return;
        }
        this.target.push(byte);
        break;
      default:
        break;
    }
  }

  invalidate(): void {
    this.field = 'ignored';
    this.command = [];
    this.target = [];
    this.oversized = false;
  }

  reset(): void {
    this.field = 'command';
    this.command = [];
    this.target = [];
    this.oversized = false;
  }
}

type State =
  | 'text'
  | 'escape'
  | 'escapeSequence'
  | 'csi'
  | 'osc'
  | 'oscEscape'
  | 'stringControl'
  | 'stringControlEscape';

export class AttachLinkScanner {
  private state: State = 'text';
  private readonly plain = new PlainScanner();
  private readonly osc = new Osc8Accumulator();
  private labelActive = false;
  /** Continuation bytes still owed to a UTF-8 character, so they are never read as C1 controls. */
  private continuation = 0;

  receive(data: Uint8Array, record: RecordTarget): void {
    for (const byte of data) this.step(byte, record);
  }

  finishOutput(record: RecordTarget): void {
    if (this.state !== 'text') this.finishPlain(record);
    else if (!this.labelActive) {
      const target = this.plain.finishOutput();
      if (target !== null) record(target);
    }
    this.state = 'text';
    this.osc.reset();
    this.labelActive = false;
    this.continuation = 0;
  }

  private step(byte: number, record: RecordTarget): void {
    switch (this.state) {
      case 'text':
        this.text(byte, record);
        break;
      case 'escape':
        this.afterEscape(byte, record);
        break;
      case 'escapeSequence':
        if (byte >= 0x30 && byte <= 0x7e) this.state = 'text';
        else if (byte === 0x1b) this.state = 'escape';
        break;
      case 'csi':
        if (byte >= 0x40 && byte <= 0x7e) {
          if (byte !== 0x6d) this.finishPlain(record);
          this.state = 'text';
        } else if (byte === 0x1b) {
          this.finishPlain(record);
          this.state = 'escape';
        }
        break;
      case 'osc':
        if (byte === 0x07 || byte === 0x9c) this.finishOsc(record);
        else if (byte === 0x1b) this.state = 'oscEscape';
        else this.osc.receive(byte);
        break;
      case 'oscEscape':
        if (byte === 0x5c) this.finishOsc(record);
        else {
          this.osc.invalidate();
          this.state = byte === 0x1b ? 'oscEscape' : 'osc';
        }
        break;
      case 'stringControl':
        if (byte === 0x9c) this.state = 'text';
        else if (byte === 0x1b) this.state = 'stringControlEscape';
        break;
      case 'stringControlEscape':
        this.state = byte === 0x5c ? 'text' : 'stringControl';
        break;
    }
  }

  private text(byte: number, record: RecordTarget): void {
    if (this.continuation > 0 && byte >= 0x80 && byte <= 0xbf) {
      this.continuation -= 1;
      if (!this.labelActive) this.plain.receive(byte, record);
      return;
    }
    this.continuation = 0;
    if (byte >= 0xc2 && byte <= 0xf4) this.continuation = byte >= 0xf0 ? 3 : byte >= 0xe0 ? 2 : 1;
    switch (byte) {
      case 0x1b:
        this.state = 'escape';
        return;
      case 0x9b:
        this.state = 'csi';
        return;
      case 0x9d:
        this.osc.reset();
        this.state = 'osc';
        return;
      case 0x90:
      case 0x98:
      case 0x9e:
      case 0x9f:
        this.finishPlain(record);
        this.state = 'stringControl';
        return;
      default:
        break;
    }
    if (byte >= 0x80 && byte <= 0x9f) {
      this.finishPlain(record);
      return;
    }
    if (!this.labelActive) this.plain.receive(byte, record);
  }

  private afterEscape(byte: number, record: RecordTarget): void {
    if (byte === 0x5b) this.state = 'csi';
    else if (byte === 0x5d) {
      this.osc.reset();
      this.state = 'osc';
    } else if (byte === 0x50 || byte === 0x58 || byte === 0x5e || byte === 0x5f) {
      this.finishPlain(record);
      this.state = 'stringControl';
    } else if (byte >= 0x20 && byte <= 0x2f) {
      this.finishPlain(record);
      this.state = 'escapeSequence';
    } else {
      this.finishPlain(record);
      this.state = 'text';
    }
  }

  private finishOsc(record: RecordTarget): void {
    const hyperlink = this.osc.hyperlink;
    this.osc.reset();
    this.state = 'text';
    this.finishPlain(record);
    if (!hyperlink) return;
    if (hyperlink.kind === 'close') {
      this.labelActive = false;
      return;
    }
    this.labelActive = true;
    if (hyperlink.target !== null) record(hyperlink.target);
  }

  private finishPlain(record: RecordTarget): void {
    if (this.labelActive) return;
    const target = this.plain.finishOutput();
    if (target !== null) record(target);
  }
}
