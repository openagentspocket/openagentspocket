/**
 * Tab, line feed and carriage return are the only control characters text may carry into a
 * terminal. Everything else, escapes above all, would be read as a command by the remote
 * terminal rather than as content.
 */
export function containsOnlySafeScalars(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x09 || code === 0x0a || code === 0x0d) continue;
    // Unicode general category Cc: the C0 controls, DEL and the C1 range.
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return false;
  }
  return true;
}
