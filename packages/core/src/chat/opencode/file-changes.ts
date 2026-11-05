// The files an OpenCode call changed, from its metadata (Swift OpenCodeFileChanges).
//
// OpenCode 2.0's file tools record `files[]`, each with its status, its counts and a unified patch
// that `createTwoFilesPatch` writes under an `Index:` line and a rule. Older rows record one file's
// patch in `diff`, with its counts in `filediff`. The record source cuts each patch at 64 Ki
// characters, so the recorded counts stand over the lines a cut patch still holds.

import { parsePatchFiles } from '../../changes/patch-parser';
import { emptyFileChanges, fileChangeFromHunks, MAXIMUM_FILE_CHANGES } from '../model/preview';
import type { ChatDiffHunk, ChatFileChange, ChatFileChanges, FileChangeKind } from '../model/types';
import type { OpenCodeFileDiff, OpenCodeToolMetadata } from './record';

/** The patch from its `--- ` header on, without the `Index:` line and the rule above it. */
function unifiedPatch(patch: string): string {
  if (patch.startsWith('--- ')) return patch;
  const header = patch.indexOf('\n--- ');
  return header < 0 ? patch : patch.slice(header + 1);
}

/**
 * One file's hunks from a unified patch that has only `---`/`+++` headers: the Changes parser reads
 * it under a git header of its own. Null when the patch holds no hunk.
 */
export function unifiedFile(patch: string, path: string): ChatFileChange | null {
  const file = parsePatchFiles(`diff --git a/file b/file\n${patch}`, false)[0];
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

/** 2.0 says `added`, `deleted` or `modified`; older rows `add`, `delete` or `update`. */
function kindOf(status: string | null): FileChangeKind {
  switch (status) {
    case 'added':
    case 'add':
    case 'create':
    case 'created':
      return 'created';
    case 'deleted':
    case 'delete':
      return 'deleted';
    default:
      return 'updated';
  }
}

/** One file: the hunks its patch holds, with the counts OpenCode recorded when it recorded them. */
function fileOf(
  path: string,
  kind: FileChangeKind,
  diff: OpenCodeFileDiff | null,
  patch: string | null,
): ChatFileChange {
  const parsed = patch === null ? null : unifiedFile(unifiedPatch(patch), path);
  const file: ChatFileChange = parsed ?? {
    path,
    kind,
    added: 0,
    removed: 0,
    lineCount: 0,
    hunks: [],
    isLineCut: false,
  };
  file.kind = kind;
  if (diff?.additions != null) file.added = diff.additions;
  if (diff?.deletions != null) file.removed = diff.deletions;
  return file;
}

/**
 * Null when the metadata records no change a row can show. `callPath` names the file an older
 * patch changed when `filediff` does not.
 */
export function openCodeFileChanges(
  metadata: OpenCodeToolMetadata | null,
  callPath: string | null,
): ChatFileChanges | null {
  if (!metadata) return null;
  const changes = emptyFileChanges(null);
  if (metadata.files.length > 0) {
    for (const diff of metadata.files) {
      if (!diff.file) continue;
      if (changes.files.length < MAXIMUM_FILE_CHANGES) {
        changes.files.push(fileOf(diff.file, kindOf(diff.status), diff, diff.patch));
      } else {
        changes.moreFiles += 1;
      }
    }
  } else if (metadata.diff !== null || metadata.filediff !== null) {
    const path = metadata.filediff?.file || callPath;
    if (path) changes.files = [fileOf(path, 'updated', metadata.filediff, metadata.diff)];
  }
  return changes.files.length === 0 && changes.moreFiles === 0 ? null : changes;
}
