/** Lines kept in the text fallback's scrollback. */
export const SCROLLBACK_LINES = 1000;

// CSI sequences (colors, cursor moves), OSC sequences (titles, links) and two-byte escapes.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching terminal escape bytes is the point.
const ESCAPES = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

/** Removes terminal escape sequences, leaving the printable text. */
export function stripAnsi(data: string): string {
  return data.replace(ESCAPES, '');
}

/**
 * Appends terminal output to a plain-text screen: escapes stripped, CRLF and
 * lone CR as newlines, backspace erasing a character, scrollback capped.
 */
export function appendOutput(screen: string, data: string, limit = SCROLLBACK_LINES): string {
  let text = screen;
  for (const char of stripAnsi(data).replace(/\r\n?/g, '\n')) {
    if (char === '\b') text = text.slice(0, -1);
    else if (char !== '\x07') text += char;
  }
  const lines = text.split('\n');
  return lines.length > limit ? lines.slice(-limit).join('\n') : text;
}

/** Columns and rows that fit a frame for a monospaced font of `fontSize`. */
export function gridSize(
  width: number,
  height: number,
  fontSize: number,
): { cols: number; rows: number } {
  const cellWidth = fontSize * 0.6;
  const cellHeight = Math.round(fontSize * 1.25);
  return {
    cols: Math.max(1, Math.floor(width / cellWidth)),
    rows: Math.max(1, Math.floor(height / cellHeight)),
  };
}
