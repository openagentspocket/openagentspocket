import {
  type DiffFile,
  type DiffNote,
  hunkTitle,
  unchangedLinesBefore,
} from '@openagentspocket/core';
import type { DiffLine } from '@openagentspocket/ui';
import { say } from './say';

/** Git's own metadata notes: the Swift app shows these in English, so does this port. */
function noteText(note: DiffNote): string {
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

function fileTitle(file: DiffFile): string {
  const { oldPath, newPath } = file;
  if (oldPath !== null && newPath !== null && oldPath !== newPath) return `${oldPath} → ${newPath}`;
  return newPath ?? oldPath ?? '';
}

/**
 * The patch as the DiffView's numbered lines: a title per file when the read holds several, the
 * file's notes, then each hunk preceded by how many unchanged lines it skips.
 */
export function diffLines(files: readonly DiffFile[]): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const file of files) {
    if (files.length > 1) lines.push({ kind: 'meta', text: fileTitle(file) });
    for (const note of file.notes) lines.push({ kind: 'meta', text: noteText(note) });
    file.hunks.forEach((hunk, index) => {
      const skipped = unchangedLinesBefore(file, index);
      if (skipped !== null)
        lines.push({ kind: 'meta', text: say('%lld unchanged lines', skipped) });
      lines.push({ kind: 'hunk', text: hunkTitle(hunk) });
      for (const line of hunk.lines) {
        lines.push({
          kind: line.kind === 'added' ? 'add' : line.kind === 'removed' ? 'del' : 'context',
          text: line.text,
          ...(line.oldNumber === null ? {} : { oldNumber: line.oldNumber }),
          ...(line.newNumber === null ? {} : { newNumber: line.newNumber }),
        });
      }
    });
  }
  return lines;
}

/** Nothing to show: no hunks and no notes (an empty read, or only headers). */
export function isEmptyPatch(files: readonly DiffFile[]): boolean {
  return files.every((file) => file.hunks.length === 0 && file.notes.length === 0);
}
