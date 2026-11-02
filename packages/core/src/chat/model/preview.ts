// Output previews and file-change capping (ported from Swift ChatToolPreview / ChatFileChange).

import { utf8Length } from '../../hosts/text';
import type {
  ChatDiffHunk,
  ChatFileChange,
  ChatFileChanges,
  ChatToolPreview,
  FileChangeKind,
} from './types';

export interface PreviewLimits {
  lines: number;
  bytes: number;
}

export const PREVIEW_ROW_LIMITS: PreviewLimits = { lines: 40, bytes: 8 * 1024 };
export const PREVIEW_EXPANDED_LIMITS: PreviewLimits = { lines: 1000, bytes: 64 * 1024 };
export const FILE_CHANGES_ROW_LIMITS: PreviewLimits = { lines: 40, bytes: 32 * 1024 };
export const FILE_CHANGES_EXPANDED_LIMITS: PreviewLimits = { lines: 2000, bytes: 512 * 1024 };
export const MAXIMUM_FILE_CHANGES = 20;
export const MAXIMUM_FETCH_BYTES = 1024 * 1024;

/** The output's start within `limits`; breaks only between characters. */
export function capPreview(
  output: string,
  imageCount = 0,
  limits: PreviewLimits = PREVIEW_ROW_LIMITS,
): ChatToolPreview {
  // Characters are code points, with "\r\n" joined like a Swift Character.
  const chars: string[] = [];
  for (const char of output) {
    if (char === '\n' && chars[chars.length - 1] === '\r') chars[chars.length - 1] = '\r\n';
    else chars.push(char);
  }
  let lines = 0;
  let bytes = 0;
  let end = 0;
  let truncated = false;
  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i] as string;
    const size = utf8Length(char);
    if (bytes + size > limits.bytes) {
      truncated = true;
      break;
    }
    if (char === '\n' || char === '\r\n') {
      lines += 1;
      if (lines === limits.lines) {
        truncated = i + 1 < chars.length;
        break;
      }
    }
    bytes += size;
    end = i + 1;
  }
  return { text: chars.slice(0, end).join(''), isTruncated: truncated, imageCount };
}

export function isNewlineMarker(line: string): boolean {
  return line.startsWith('\\');
}

function diffLineCount(hunk: ChatDiffHunk): number {
  return hunk.lines.reduce((n, line) => (isNewlineMarker(line) ? n : n + 1), 0);
}

export function isFileChangeComplete(change: ChatFileChange): boolean {
  return (
    !change.isLineCut && change.hunks.reduce((n, h) => n + diffLineCount(h), 0) >= change.lineCount
  );
}

function prefixWithin(line: string, bytes: number): string {
  let size = 0;
  let out = '';
  for (const char of line) {
    const next = size + utf8Length(char);
    if (next > bytes) break;
    size = next;
    out += char;
  }
  return out;
}

interface Kept {
  hunks: ChatDiffHunk[];
  isAll: boolean;
  isLineCut: boolean;
}

function keepHunks(hunks: ChatDiffHunk[], limits: PreviewLimits): Kept {
  const result: ChatDiffHunk[] = [];
  let isLineCut = false;
  let keptLines = 0;
  let keptBytes = 0;
  for (const hunk of hunks) {
    const kept: ChatDiffHunk = { ...hunk, lines: [] };
    let isFull = false;
    for (const line of hunk.lines) {
      const marker = isNewlineMarker(line);
      if (!marker && keptLines === limits.lines) {
        isFull = true;
        break;
      }
      const size = utf8Length(line);
      if (keptBytes + size > limits.bytes) {
        if (keptLines === 0 && !marker) {
          kept.lines.push(prefixWithin(line, limits.bytes));
          keptLines += 1;
          isLineCut = true;
        }
        isFull = true;
        break;
      }
      kept.lines.push(line);
      keptBytes += size;
      if (!marker) keptLines += 1;
    }
    if (kept.lines.length > 0) result.push(kept);
    if (isFull) return { hunks: result, isAll: false, isLineCut };
  }
  return { hunks: result, isAll: true, isLineCut: false };
}

/** A change from recorded hunks, counting every line and keeping up to `limits`. */
export function fileChangeFromHunks(
  path: string,
  kind: FileChangeKind,
  recorded: ChatDiffHunk[],
  limits: PreviewLimits = FILE_CHANGES_ROW_LIMITS,
): ChatFileChange {
  let added = 0;
  let removed = 0;
  let lineCount = 0;
  for (const hunk of recorded) {
    for (const line of hunk.lines) {
      if (isNewlineMarker(line)) continue;
      lineCount += 1;
      if (line.startsWith('+')) added += 1;
      if (line.startsWith('-')) removed += 1;
    }
  }
  const kept = keepHunks(recorded, limits);
  return { path, kind, added, removed, lineCount, hunks: kept.hunks, isLineCut: kept.isLineCut };
}

function countLines(text: string): number {
  if (text.length === 0) return 0;
  let newlines = 0;
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) newlines += 1;
  return text.endsWith('\n') ? newlines : newlines + 1;
}

/** A created or written file shown as all-added lines. */
export function allAddedChange(
  path: string,
  content: string,
  kind: FileChangeKind,
  limits: PreviewLimits = FILE_CHANGES_ROW_LIMITS,
): ChatFileChange {
  const count = countLines(content);
  const lines = content
    .split('\n')
    .slice(0, Math.min(count, limits.lines))
    .map((line) => `+${line}`);
  const hunks: ChatDiffHunk[] =
    lines.length === 0 ? [] : [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: count, lines }];
  const change = fileChangeFromHunks(path, kind, hunks, limits);
  return { ...change, added: count, lineCount: count };
}

export function emptyFileChanges(directory: string | null): ChatFileChanges {
  return {
    files: [],
    moreFiles: 0,
    directory,
    isShared: false,
    isUnavailable: false,
    isSkipped: false,
    movesWorkingTree: false,
  };
}

function relativeTo(path: string, directory: string): string | null {
  const prefix = directory.endsWith('/') ? directory : `${directory}/`;
  return path.startsWith(prefix) && path.length > prefix.length ? path.slice(prefix.length) : null;
}

function unaliased(path: string): string {
  for (const root of ['/private/tmp', '/private/var', '/private/etc']) {
    if (path === root || path.startsWith(`${root}/`)) return path.slice('/private'.length);
  }
  return path;
}

/** The path relative to the call's directory, when it sits under it. */
export function relativeToDirectory(path: string, directory: string | null): string {
  if (!directory) return path;
  return relativeTo(path, directory) ?? relativeTo(unaliased(path), unaliased(directory)) ?? path;
}
