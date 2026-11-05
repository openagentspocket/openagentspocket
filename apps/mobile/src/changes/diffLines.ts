import {
  type DiffFile,
  type DiffNote,
  hunkTitle,
  unchangedLinesBefore,
} from '@openagentspocket/core';
import type { DiffHunk, DiffRowLine, DiffSegment } from '@openagentspocket/ui';
import { say } from './say';

/** Git's own metadata notes: the Swift app shows these in English, so does this port. */
export function noteText(note: DiffNote): string {
  switch (note.kind) {
    case 'binary':
      return say('Binary file.');
    case 'renamed':
      return `Renamed from ${note.from} to ${note.to}.`;
    case 'mode':
      return `File mode changed from ${note.from} to ${note.to}.`;
    case 'newEmpty':
      return 'New empty file.';
    case 'deletedEmpty':
      return 'Deleted empty file.';
  }
}

export function patchFileTitle(file: DiffFile): string {
  const { oldPath, newPath } = file;
  if (oldPath !== null && newPath !== null && oldPath !== newPath) return `${oldPath} → ${newPath}`;
  return newPath ?? oldPath ?? '';
}

const TOKEN = /\s+|\w+|[^\w\s]/g;

/**
 * The words that differ between a removed line and the added line that replaces it: the tokens
 * between their common head and tail. null when nothing, or everything, differs (no point washing).
 */
export function wordSegments(
  before: string,
  after: string,
): { before: DiffSegment[]; after: DiffSegment[] } | null {
  const a = before.match(TOKEN) ?? [];
  const b = after.match(TOKEN) ?? [];
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail++;
  }
  const split = (tokens: string[]): DiffSegment[] =>
    [
      { text: tokens.slice(0, head).join('') },
      { text: tokens.slice(head, tokens.length - tail).join(''), changed: true },
      { text: tokens.slice(tokens.length - tail).join('') },
    ].filter((segment) => segment.text !== '');
  const changedA = a.length - head - tail;
  const changedB = b.length - head - tail;
  if ((changedA === 0 && changedB === 0) || (head === 0 && tail === 0)) return null;
  return { before: split(a), after: split(b) };
}

/** Each removed line paired with the added line at the same place in its run gets word washes. */
function withWords(lines: DiffRowLine[]): DiffRowLine[] {
  const out = [...lines];
  let i = 0;
  while (i < out.length) {
    const start = i;
    while (out[i]?.kind === 'del') i++;
    const dels = i;
    while (out[i]?.kind === 'add') i++;
    for (let k = 0; k < Math.min(dels - start, i - dels); k++) {
      const del = out[start + k] as DiffRowLine;
      const add = out[dels + k] as DiffRowLine;
      const words = wordSegments(del.text ?? '', add.text ?? '');
      if (words) {
        out[start + k] = { ...del, segments: words.before };
        out[dels + k] = { ...add, segments: words.after };
      }
    }
    if (i === start) i++;
  }
  return out;
}

/** One patch file as DiffRow hunks: git's `@@` header and how many unchanged lines each skips. */
export function diffHunks(file: DiffFile): DiffHunk[] {
  return file.hunks.map((hunk, index) => {
    const skipped = unchangedLinesBefore(file, index);
    const lines: DiffRowLine[] = hunk.lines.map((line) => ({
      kind: line.kind === 'added' ? 'add' : line.kind === 'removed' ? 'del' : 'context',
      text: line.text,
      ...(line.oldNumber === null ? {} : { oldNumber: line.oldNumber }),
      ...(line.newNumber === null ? {} : { newNumber: line.newNumber }),
    }));
    return {
      header: hunkTitle(hunk),
      gapLabel: skipped === null ? undefined : say('%lld unchanged lines', skipped),
      lines: withWords(lines),
    };
  });
}

/** Nothing to show: no hunks and no notes (an empty read, or only headers). */
export function isEmptyPatch(files: readonly DiffFile[]): boolean {
  return files.every((file) => file.hunks.length === 0 && file.notes.length === 0);
}
