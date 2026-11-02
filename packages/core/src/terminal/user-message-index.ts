import { utf8Decode } from '../pairing/bytes';

// Port of Swift `AttachUserMessageIndex`. The conversation on a phone is a repainted terminal grid,
// not a message model (ADR 0013), so the jump control works from what the grid shows (the prompt
// glyph a TUI draws on the user's own turns: `>`, `›`, `❯`), backed by the messages this app sent.
// Both sources answer `visibleMessageKeys` with stable identities: a prompt line's key is derived
// from that one line, never from how much of the message is on screen, so it does not change as the
// message scrolls in a row at a time. A wrong or missing target only costs jump accuracy.

/** Where a PTY write originated; LF and Escape mean different things by source, not by byte. */
export type OutgoingSource =
  /** Direct Input and tools-keyboard send: LF submits, Escape is skipped. */
  | 'keystroke'
  /** Blocked Composer insert: LF is content, Escape cancels the pending line. */
  | 'composerInsert'
  /** Snippet body: LF is content, Escape is skipped. */
  | 'snippet'
  /** Reviewed or single-line paste: newlines are content, Escape is skipped. */
  | 'paste'
  /** The Esc quick key: cancels a Composer-inserted pending line, starts no CSI/SS3 lookahead. */
  | 'escapeKey';

export interface SubmittedEntry {
  readonly id: string;
  /** Exactly what the user submitted. */
  readonly rawText: string;
  /** `rawText` under `normalizeMessage`, precomputed for matching. */
  readonly normalizedText: string;
}

/** Minimum weight for a message to be a jump target (short replies like `y` collide otherwise). */
export const MINIMUM_ENTRY_WEIGHT = 8;
/** Oldest entries are dropped past this so a long session stays bounded. */
export const MAXIMUM_ENTRY_COUNT = 200;
/** Leading characters matched against the whole frame (TUIs may truncate or reflow). */
export const MATCH_PREFIX_CHARACTER_COUNT = 64;
/** Head matched against a single rendered line (gutter content can split a longer match). */
export const LINE_MATCH_PREFIX_CHARACTER_COUNT = 24;
/** Columns of leading whitespace a prompt glyph may sit behind (tool output is indented deeper). */
export const MAXIMUM_PROMPT_INDENT = 2;

const HSPACE = /^[ \t   -   　]+/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: Swift isNewline includes VT and FF
const NEWLINE = /\r\n|[\n\r\u000b\u000c\u0085\u2028\u2029]/;

function isIdeographic(code: number): boolean {
  return (
    (code >= 0x3040 && code <= 0x30ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0x20000 && code <= 0x3ffff)
  );
}

/** A CJK ideograph, kana or hangul syllable is a word, not a letter, so it counts double. */
export function messageWeight(text: string): number {
  let total = 0;
  for (const char of text) total += isIdeographic(char.codePointAt(0) ?? 0) ? 2 : 1;
  return total;
}

const collapse = (text: string) => text.split(/\s+/).filter(Boolean).join(' ');
const head = (text: string, length: number) => Array.from(text).slice(0, length).join('');
const isPromptGlyph = (code: number) => code === 0x3e || code === 0x203a || code === 0x276f;
const isBoxGlyph = (code: number) => code >= 0x2500 && code <= 0x259f;

interface StrippedLine {
  text: string;
  hasPromptGlyph: boolean;
  indent: number;
}

function strip(line: string): StrippedLine {
  const indent = Array.from(HSPACE.exec(line)?.[0] ?? '').length;
  let text = line;
  let sawPrompt = false;
  for (;;) {
    text = text.replace(HSPACE, '').replace(/[ \t   -   　]+$/, '');
    const first = text.codePointAt(0);
    if (first === undefined) return { text, hasPromptGlyph: sawPrompt, indent };
    if (isPromptGlyph(first)) {
      // A glyph must be followed by a space: `>_ OpenAI Codex` is a banner, not a user turn.
      const rest = Array.from(text).slice(1)[0];
      if (rest !== undefined && !HSPACE.test(rest))
        return { text, hasPromptGlyph: sawPrompt, indent };
      sawPrompt = true;
    } else if (!isBoxGlyph(first)) {
      return { text, hasPromptGlyph: sawPrompt, indent };
    }
    text = Array.from(text).slice(1).join('');
  }
}

/**
 * Collapses a terminal frame or a submitted line to a comparable form: per line, drop leading box
 * and prompt glyphs and surrounding whitespace; join with one space; collapse every whitespace run.
 */
export function normalizeMessage(text: string): string {
  return collapse(
    text
      .split(NEWLINE)
      .map((line) => strip(line).text)
      .join(' '),
  );
}

type ScanState = 'text' | 'escape' | 'csi' | 'ss3';

export class AttachUserMessageIndex {
  private all: SubmittedEntry[] = [];
  private nextId = 1;
  private pendingText = '';
  private pendingSource: OutgoingSource = 'keystroke';
  private remainder: number[] = [];
  private scanState: ScanState = 'text';
  private readonly promptIndentLimit: number;

  constructor(maximumPromptIndent: number = MAXIMUM_PROMPT_INDENT) {
    this.promptIndentLimit = Math.max(0, maximumPromptIndent);
  }

  /** Submitted messages, oldest first. */
  get entries(): readonly SubmittedEntry[] {
    return this.all;
  }

  /**
   * Bytes the app is about to write to the PTY. Printable content accumulates; a keystroke CR or LF
   * closes the pending line; newlines inside a Composer insert, snippet or paste are content. The
   * Esc quick key cancels a Composer-inserted pending line, and so does a keystroke write that
   * ends on an unresolved ESC while the pending line is a Composer insert (hardware Esc).
   */
  observeOutgoing(data: Uint8Array, source: OutgoingSource = 'keystroke'): void {
    if (source === 'escapeKey') {
      if (this.pendingSource === 'composerInsert') this.cancelPending();
      this.scanState = 'text';
      return;
    }
    const bytes = this.remainder.length === 0 ? Array.from(data) : [...this.remainder, ...data];
    this.remainder = [];
    let offset = 0;
    while (offset < bytes.length) {
      const byte = bytes[offset] as number;
      if (this.scanState === 'escape') {
        if (byte === 0x5b) {
          this.scanState = 'csi';
          offset += 1;
        } else if (byte === 0x4f) {
          this.scanState = 'ss3';
          offset += 1;
        } else this.scanState = 'text';
        continue;
      }
      if (this.scanState === 'csi') {
        offset += 1;
        if (byte >= 0x40 && byte <= 0x7e) this.scanState = 'text';
        else if (byte === 0x1b) this.scanState = 'escape';
        continue;
      }
      if (this.scanState === 'ss3') {
        offset += 1;
        this.scanState = 'text';
        continue;
      }
      offset += 1;
      if (byte === 0x1b) this.scanState = 'escape';
      else if (byte === 0x9b) this.scanState = 'csi';
      else if (byte === 0x8f) this.scanState = 'ss3';
      else if (byte === 0x0d || byte === 0x0a) this.newline(byte === 0x0d ? '\r' : '\n', source);
      else if (byte === 0x08 || byte === 0x7f) this.backspace();
      else if (byte < 0x20) continue;
      else if (byte < 0x80) this.appendPending(String.fromCharCode(byte), source);
      else {
        const step = utf8Step(bytes, offset - 1);
        if (step === 'incomplete') {
          this.remainder = bytes.slice(offset - 1);
          return;
        }
        if (step !== 'invalid') {
          this.appendPending(String.fromCodePoint(step.code), source);
          offset += step.width - 1;
        }
      }
    }
    if (this.scanState === 'escape' && this.pendingSource === 'composerInsert') {
      this.cancelPending();
      this.scanState = 'text';
    }
  }

  /** A message delivered out of band (the Composer's `agent.prompt` path never crosses the PTY). */
  recordSubmitted(text: string): void {
    this.appendEntry(text);
  }

  /** Drops everything: entries describe one session's scrollback and must not outlive it. */
  reset(): void {
    this.all = [];
    this.pendingText = '';
    this.pendingSource = 'keystroke';
    this.remainder = [];
    this.scanState = 'text';
  }

  /** Stable identities of every user message visible in `frameText`. */
  visibleMessageKeys(frameText: string): Set<string> {
    const lines = frameText.split(NEWLINE).map(strip);
    const keys = new Set<string>();
    for (const line of lines) {
      const key = this.promptLineKey(line);
      if (key !== null) keys.add(key);
    }
    if (this.all.length === 0) return keys;
    const normalizedLines = lines.map((l) => collapse(l.text));
    const frame = collapse(lines.map((l) => l.text).join(' '));
    for (const entry of this.all) {
      const wide = head(entry.normalizedText, MATCH_PREFIX_CHARACTER_COUNT);
      if (wide !== '' && frame.includes(wide)) {
        keys.add(`sent:${entry.id}`);
        continue;
      }
      const narrow = head(entry.normalizedText, LINE_MATCH_PREFIX_CHARACTER_COUNT);
      if (narrow !== '' && normalizedLines.some((l) => l.includes(narrow))) {
        keys.add(`sent:${entry.id}`);
      }
    }
    return keys;
  }

  frameContainsMessage(frameText: string): boolean {
    return this.visibleMessageKeys(frameText).size > 0;
  }

  private newline(char: string, source: OutgoingSource): void {
    if (source === 'composerInsert' || source === 'snippet' || source === 'paste') {
      if (this.pendingText !== '') this.appendPending(char, source);
      return;
    }
    const raw = this.pendingText;
    this.pendingText = '';
    this.pendingSource = 'keystroke';
    this.appendEntry(raw);
  }

  private backspace(): void {
    if (this.pendingText === '') return;
    this.pendingText = Array.from(this.pendingText).slice(0, -1).join('');
    if (this.pendingText === '') this.pendingSource = 'keystroke';
  }

  private cancelPending(): void {
    this.pendingText = '';
    this.pendingSource = 'keystroke';
    this.remainder = [];
  }

  private appendPending(char: string, source: OutgoingSource): void {
    if (this.pendingText === '' || source === 'composerInsert') this.pendingSource = source;
    this.pendingText += char;
  }

  private appendEntry(rawText: string): void {
    const normalizedText = normalizeMessage(rawText);
    if (messageWeight(normalizedText) < MINIMUM_ENTRY_WEIGHT) return;
    this.all.push({ id: String(this.nextId++), rawText, normalizedText });
    if (this.all.length > MAXIMUM_ENTRY_COUNT) {
      this.all.splice(0, this.all.length - MAXIMUM_ENTRY_COUNT);
    }
  }

  /** Only the text before the line's first double space contributes: right-aligned gutters repaint. */
  private promptLineKey(line: StrippedLine): string | null {
    if (!line.hasPromptGlyph || line.indent > this.promptIndentLimit) return null;
    const body = collapse(line.text.split('  ')[0] ?? line.text);
    return messageWeight(body) >= MINIMUM_ENTRY_WEIGHT ? `line:${body}` : null;
  }
}

function utf8Step(
  bytes: number[],
  at: number,
): 'incomplete' | 'invalid' | { code: number; width: number } {
  const lead = bytes[at] as number;
  const width =
    lead >= 0xc2 && lead <= 0xdf
      ? 2
      : lead >= 0xe0 && lead <= 0xef
        ? 3
        : lead >= 0xf0 && lead <= 0xf4
          ? 4
          : 0;
  if (width === 0) return 'invalid';
  if (bytes.length - at < width) return 'incomplete';
  const decoded = utf8Decode(Uint8Array.from(bytes.slice(at, at + width)), true);
  const code = decoded === null ? undefined : decoded.codePointAt(0);
  if (decoded === null || code === undefined || Array.from(decoded).length !== 1) return 'invalid';
  return { code, width };
}
