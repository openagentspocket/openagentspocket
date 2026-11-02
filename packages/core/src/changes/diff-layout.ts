import type { DiffFile, DiffHunk, DiffLine } from './types';

/** One side-by-side row. `id` is a unified line id: the left line's, else the right line's. */
export interface SideBySideRow {
  readonly id: number;
  readonly left: DiffLine | null;
  readonly right: DiffLine | null;
}

/**
 * Pairs a hunk's unified lines for the side-by-side columns: each run of removals with the
 * additions that follow it, context on both sides. Views keep the line text whole.
 */
export function sideBySideRows(hunk: DiffHunk): SideBySideRow[] {
  const rows: SideBySideRow[] = [];
  let removed: DiffLine[] = [];
  let added: DiffLine[] = [];
  const flush = () => {
    const count = Math.max(removed.length, added.length);
    for (let index = 0; index < count; index++) {
      const left = removed[index] ?? null;
      const right = added[index] ?? null;
      const id = left?.id ?? right?.id;
      if (id !== undefined) rows.push({ id, left, right });
    }
    removed = [];
    added = [];
  };
  for (const line of hunk.lines) {
    if (line.kind === 'context') {
      flush();
      rows.push({ id: line.id, left: line, right: line });
    } else if (line.kind === 'removed') {
      // An added run followed by a removal is a new block; pairing across it would cross changes.
      if (added.length > 0) flush();
      removed.push(line);
    } else {
      added.push(line);
    }
  }
  flush();
  return rows;
}

/**
 * Unchanged lines between the previous hunk (or the file's start) and the hunk at `index`, from
 * the hunk headers; null when there are none. A zero-count side names the line before the change.
 */
export function unchangedLinesBefore(file: DiffFile, index: number): number | null {
  const hunk = file.hunks[index];
  if (!hunk) return null;
  const lastUnchanged = hunk.oldCount === 0 ? hunk.oldStart : hunk.oldStart - 1;
  let previousEnd = 0;
  const previous = file.hunks[index - 1];
  if (index > 0 && previous) {
    previousEnd =
      previous.oldCount === 0 ? previous.oldStart : previous.oldStart + previous.oldCount - 1;
  }
  const count = lastUnchanged - previousEnd;
  return count > 0 ? count : null;
}

/** Counted from the lines this read holds. */
export function fileLineCounts(file: DiffFile): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === 'added') added += 1;
      else if (line.kind === 'removed') removed += 1;
    }
  }
  return { added, removed };
}

export function hunkRange(hunk: DiffHunk): string {
  return `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`;
}

export function hunkTitle(hunk: DiffHunk): string {
  return hunk.section === '' ? hunkRange(hunk) : `${hunkRange(hunk)} ${hunk.section}`;
}
