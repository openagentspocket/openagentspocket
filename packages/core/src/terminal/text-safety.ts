/**
 * What arbitrary text may look like before it reaches a pane (Swift `TerminalTextSafety`).
 * Snippets and, later, Terminal paste both go through here so they cannot drift apart.
 */

/**
 * Tab, line feed and carriage return are the only control characters text may carry. Everything
 * else (escapes above all) would be read as a command by the remote terminal, not as content.
 */
export function containsOnlySafeScalars(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x09 || code === 0x0a || code === 0x0d) continue;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return false;
  }
  return true;
}

/**
 * Collapses CRLF and lone CR to LF. The Enter key sends CR, so a carriage return that arrived
 * with pasted text is a submit byte in disguise; LF is not.
 */
export function normalizingNewlines(text: string): string {
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

/** True when `text` contains a CR or LF. */
export function isMultiline(text: string): boolean {
  return text.includes('\n') || text.includes('\r');
}
