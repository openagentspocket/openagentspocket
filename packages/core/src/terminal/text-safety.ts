import { utf8Encode } from '../pairing/bytes';

/**
 * The one place that decides what arbitrary text may look like before it reaches a pane, and how
 * it is framed on the wire. Terminal Paste and Snippets both go through here (Swift
 * `TerminalTextSafety` and `TerminalBracketedPaste`).
 */

/** Control characters other than tab, line feed and carriage return: C0, DEL and C1. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point.
const UNSAFE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;

/**
 * Tab, LF and CR are the only control characters text may carry. Everything else, escapes above
 * all, would be read as a command by the remote terminal rather than as content.
 */
export function containsOnlySafeScalars(text: string): boolean {
  return !UNSAFE.test(text);
}

/** Collapses CRLF and lone CR to LF: a CR is the Enter key's byte, a submit in disguise. */
export function normalizingNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function isMultiline(text: string): boolean {
  return /[\n\r]/.test(text);
}

export const BRACKETED_PASTE_START = Uint8Array.of(0x1b, 0x5b, 0x32, 0x30, 0x30, 0x7e);
export const BRACKETED_PASTE_END = Uint8Array.of(0x1b, 0x5b, 0x32, 0x30, 0x31, 0x7e);

/**
 * The bytes to write for `text`, framed (DECSET 2004) only when the remote application asked for
 * framing: without it the markers would be echoed as literal garbage.
 */
export function encodePaste(text: string, bracketed: boolean): Uint8Array {
  const body = utf8Encode(text);
  if (!bracketed) return body;
  const out = new Uint8Array(
    BRACKETED_PASTE_START.length + body.length + BRACKETED_PASTE_END.length,
  );
  out.set(BRACKETED_PASTE_START, 0);
  out.set(body, BRACKETED_PASTE_START.length);
  out.set(BRACKETED_PASTE_END, BRACKETED_PASTE_START.length + body.length);
  return out;
}
