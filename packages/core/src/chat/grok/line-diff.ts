// A line diff that tags each line equal, deleted or inserted, matching Swift's
// `Collection.difference(from:)` (Myers' O(ND) algorithm), whose removed and inserted offsets the
// Grok file changes read (Swift GrokFileChanges.lineDiff).

export type Tag = 'equal' | 'delete' | 'insert';

/** Texts longer than this together, in lines, read as every old line removed and every new one added. */
const MAXIMUM_DIFF_LINES = 2000;

/** The offsets Myers' shortest edit script removes from `old` and inserts from `next`. */
function myers(
  old: readonly string[],
  next: readonly string[],
): { removed: Set<number>; inserted: Set<number> } {
  const n = old.length;
  const m = next.length;
  const max = n + m;
  const offset = max + 1;
  const v = new Array<number>(2 * max + 3).fill(0);
  const trace: number[][] = [];
  let found = false;
  for (let d = 0; d <= max && !found; d += 1) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && (v[offset + k - 1] as number) < (v[offset + k + 1] as number))) {
        x = v[offset + k + 1] as number;
      } else {
        x = (v[offset + k - 1] as number) + 1;
      }
      let y = x - k;
      while (x < n && y < m && old[x] === next[y]) {
        x += 1;
        y += 1;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }
  const removed = new Set<number>();
  const inserted = new Set<number>();
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d > 0; d -= 1) {
    const before = trace[d] as number[];
    const k = x - y;
    const down =
      k === -d ||
      (k !== d && (before[offset + k - 1] as number) < (before[offset + k + 1] as number));
    const previousK = down ? k + 1 : k - 1;
    const previousX = before[offset + previousK] as number;
    const previousY = previousX - previousK;
    // The diagonal run after the step is equal lines.
    while (x > previousX && y > previousY) {
      x -= 1;
      y -= 1;
    }
    if (x === previousX) inserted.add(previousY);
    else removed.add(previousX);
    x = previousX;
    y = previousY;
  }
  return { removed, inserted };
}

/** `old` and `next` diffed line by line, each change's removed lines before its added ones. */
export function lineDiff(
  old: readonly string[],
  next: readonly string[],
): { tag: Tag; text: string }[] {
  if (old.length + next.length > MAXIMUM_DIFF_LINES) {
    return [
      ...old.map((text) => ({ tag: 'delete' as const, text })),
      ...next.map((text) => ({ tag: 'insert' as const, text })),
    ];
  }
  const { removed, inserted } = myers(old, next);
  const result: { tag: Tag; text: string }[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < old.length || newIndex < next.length) {
    if (oldIndex < old.length && removed.has(oldIndex)) {
      result.push({ tag: 'delete', text: old[oldIndex] as string });
      oldIndex += 1;
    } else if (newIndex < next.length && inserted.has(newIndex)) {
      result.push({ tag: 'insert', text: next[newIndex] as string });
      newIndex += 1;
    } else if (oldIndex < old.length && newIndex < next.length) {
      result.push({ tag: 'equal', text: old[oldIndex] as string });
      oldIndex += 1;
      newIndex += 1;
    } else {
      break;
    }
  }
  return result;
}
