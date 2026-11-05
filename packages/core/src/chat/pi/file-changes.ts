// The files a Pi or Oh My Pi edit changed, from its result's `details` (Swift PiFileChanges).
//
// Oh My Pi records `diff` as numbered lines without hunk headers: ` 12|text` and `-12|text` carry
// the old file's line number, `+12|text` the new file's, and a blank line or a jump in the numbers
// starts another hunk. `path` names the file, and an edit of several files lists each one's
// details in `perFileResults`. Pi records a unified diff in `patch` and leaves the path to the
// call's arguments.

import { encodeText } from '../../changes/bytes';
import { parsePatchFiles } from '../../changes/patch-parser';
import { patchPaths } from '../model/patch-paths';
import { emptyFileChanges, fileChangeFromHunks, MAXIMUM_FILE_CHANGES } from '../model/preview';
import { asArray, asObject, asString, type JsonObject } from '../model/reducer';
import type { ChatDiffHunk, ChatFileChange, ChatFileChanges, FileChangeKind } from '../model/types';

/** Nil when the details record no change a row can show. */
export function piFileChanges(
  details: unknown,
  callPath: string | null,
  directory: string | null,
): ChatFileChanges | null {
  const record = asObject(details);
  const changes = emptyFileChanges(directory);
  const results = asArray(record?.perFileResults);
  const patch = asString(record?.patch);
  if (results) {
    for (const result of results) {
      const file = numberedFile(asObject(result));
      if (!file) continue;
      if (changes.files.length < MAXIMUM_FILE_CHANGES) changes.files.push(file);
      else changes.moreFiles += 1;
    }
  } else if (patch !== null) {
    if (callPath === null || callPath === '') return null;
    const file = unifiedFile(patch, callPath);
    if (!file) return null;
    changes.files = [file];
  } else {
    const file = numberedFile(record);
    if (file) changes.files = [file];
  }
  return changes.files.length === 0 && changes.moreFiles === 0 ? null : changes;
}

/** Swift's `isNewline`: CRLF, LF, CR, VT, FF, NEL, LS and PS. */

function numberedFile(details: JsonObject | null): ChatFileChange | null {
  const path = asString(details?.path);
  if (path === null || path === '') return null;
  const hunks = numberedHunks(asString(details?.diff) ?? '');
  if (hunks === null) return null;
  const op = asString(details?.op);
  const kind: FileChangeKind =
    op === 'create' ? 'created' : op === 'delete' ? 'deleted' : 'updated';
  // A deleted file may record no lines; any other change shows some.
  if (hunks.length === 0 && kind !== 'deleted') return null;
  return fileChangeFromHunks(path, kind, hunks);
}

/** `^([+\- ])\s*(\d+)\|(.*)$`: the sign, the number and the text of one numbered line. */
function numberedLine(line: string): { sign: string; number: number; text: string } | null {
  const sign = line[0];
  if (sign !== ' ' && sign !== '-' && sign !== '+') return null;
  const bar = line.indexOf('|');
  if (bar < 0) return null;
  const digits = line.slice(1, bar).replace(/^ +/, '');
  if (!/^[0-9]+$/.test(digits)) return null;
  return { sign, number: Number.parseInt(digits, 10), text: line.slice(bar + 1) };
}

/**
 * Hunks from Oh My Pi's numbered diff lines; null when a line has another form, which would number
 * every line after it wrongly.
 */
export function numberedHunks(diff: string): ChatDiffHunk[] | null {
  const hunks: ChatDiffHunk[] = [];
  let current: ChatDiffHunk | null = null;
  let nextOld = 0;
  let nextNew = 0;
  /** New line numbers less old ones, past the hunks closed so far. */
  let delta = 0;
  const close = () => {
    if (!current) return;
    // A side with no lines names the line before the change.
    if (current.oldLines === 0) current.oldStart = Math.max(current.oldStart - 1, 0);
    if (current.newLines === 0) current.newStart = Math.max(current.newStart - 1, 0);
    hunks.push(current);
    delta = nextNew - nextOld;
    current = null;
  };
  for (const line of diff.split('\n')) {
    if (line === '') {
      close();
      continue;
    }
    const parsed = numberedLine(line);
    if (!parsed) return null;
    const { sign, number, text } = parsed;
    if (current === null || number !== (sign === '+' ? nextNew : nextOld)) {
      close();
      const oldStart = sign === '+' ? number - delta : number;
      current = { oldStart, oldLines: 0, newStart: oldStart + delta, newLines: 0, lines: [] };
      nextOld = oldStart;
      nextNew = oldStart + delta;
    }
    const open: ChatDiffHunk = current;
    if (sign !== '+') {
      open.oldLines += 1;
      nextOld += 1;
    }
    if (sign !== '-') {
      open.newLines += 1;
      nextNew += 1;
    }
    open.lines.push(sign + text);
  }
  close();
  return hunks;
}

/**
 * Pi's patch has only `---`/`+++` file headers, so the Changes parser reads it under a git header
 * of its own. OpenCode's patches read the same way once their `Index:` lines are dropped.
 */
export function unifiedFile(patch: string, path: string): ChatFileChange | null {
  const [file] = parsePatchFiles(encodeText(`diff --git a/file b/file\n${patch}`), false);
  if (!file || file.hunks.length === 0) return null;
  const hunks: ChatDiffHunk[] = file.hunks.map((hunk) => ({
    oldStart: hunk.oldStart,
    oldLines: hunk.oldCount,
    newStart: hunk.newStart,
    newLines: hunk.newCount,
    lines: hunk.lines.flatMap((line) => {
      const sign = line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' ';
      const text = sign + line.text;
      return line.missingNewline ? [text, '\\ No newline at end of file'] : [text];
    }),
  }));
  return fileChangeFromHunks(path, 'updated', hunks);
}

export { patchPaths };
