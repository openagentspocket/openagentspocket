// A frame read while an Agent works differs from the last one even when nothing scrolled: a spinner,
// a timer and a token counter repaint their own rows, and a status verb can replace a whole row.
// Those rows differ from one program to the next, so nothing here names them: what tells them from
// a scroll is the shape of the change. An animation rewrites a few rows where they stand; a scroll
// carries rows to other places, or replaces most of the screen.

const hasContent = (row: string) => /[\p{L}\p{N}]/u.test(row);
const withoutNumbers = (row: string) => row.replace(/\p{N}+/gu, '#');
const rowsOf = (frame: string) => frame.split('\n').map((row) => row.trimEnd());

/** Whether `next` shows the conversation somewhere else than `previous` did. */
export function conversationMoved(previous: string, next: string): boolean {
  if (previous === next) return false;
  const before = rowsOf(previous);
  const after = rowsOf(next);
  const earlier = new Set(before);
  let rows = 0;
  let changed = 0;
  for (let index = 0; index < Math.max(before.length, after.length); index += 1) {
    const was = before[index] ?? '';
    const now = after[index] ?? '';
    if (!hasContent(was) && !hasContent(now)) continue;
    rows += 1;
    if (was === now) continue;
    changed += 1;
    // Two timers a second apart trade texts in place, so a carried row is more than its numbers.
    if (hasContent(now) && earlier.has(now) && withoutNumbers(now) !== withoutNumbers(was)) {
      return true;
    }
  }
  return changed * 2 > rows;
}
