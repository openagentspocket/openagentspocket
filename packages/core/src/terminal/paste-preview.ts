/** Longest preview shown in the review sheet; the confirmed text is never truncated. */
export const PASTE_PREVIEW_LIMIT = 2_000;

/** Lines in the text, counting CRLF as one break and a lone CR as a break. */
export function pasteLineCount(text: string): number {
  let count = 1;
  let previousWasCr = false;
  for (const char of text) {
    if (char === '\n') {
      if (!previousWasCr) count += 1;
    } else if (char === '\r') {
      count += 1;
    }
    previousWasCr = char === '\r';
  }
  return count;
}

export function pastePreview(text: string): string {
  const chars = Array.from(text);
  return chars.length > PASTE_PREVIEW_LIMIT
    ? `${chars.slice(0, PASTE_PREVIEW_LIMIT).join('')}…`
    : text;
}
