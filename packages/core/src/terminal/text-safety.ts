import { utf8Encode } from '../pairing/bytes';

// Port of Swift `TerminalTextSafety` and `TerminalBracketedPaste`: the one place that decides what
// arbitrary text may look like before it reaches a pane, shared by Paste and Snippets.

/** True for a Unicode control character (general category Cc). */
function isControl(code: number): boolean {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

/**
 * Tab, line feed and carriage return are the only control characters text may carry. Anything else
 * (an escape above all) would be read as a command by the remote terminal rather than as content.
 */
export function containsOnlySafeScalars(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x09 || code === 0x0a || code === 0x0d) continue;
    if (isControl(code)) return false;
  }
  return true;
}

/**
 * Collapses CRLF and lone CR to LF. The Enter key sends CR, so a carriage return that arrived with
 * pasted text is a submit byte in disguise; LF is not.
 */
export function normalizingNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** True when the text contains a CR or LF. */
export function isMultiline(text: string): boolean {
  return text.includes('\n') || text.includes('\r');
}

const BRACKETED_START = Uint8Array.from([0x1b, 0x5b, 0x32, 0x30, 0x30, 0x7e]);
const BRACKETED_END = Uint8Array.from([0x1b, 0x5b, 0x32, 0x30, 0x31, 0x7e]);

/**
 * The bytes to write for `text`, framed with DECSET 2004 markers only when the remote application
 * asked for framing: without the mode the markers would be echoed as literal garbage.
 */
export function encodePaste(text: string, bracketed: boolean): Uint8Array {
  const body = utf8Encode(text);
  if (!bracketed) return body;
  const out = new Uint8Array(BRACKETED_START.length + body.length + BRACKETED_END.length);
  out.set(BRACKETED_START, 0);
  out.set(body, BRACKETED_START.length);
  out.set(BRACKETED_END, BRACKETED_START.length + body.length);
  return out;
}
