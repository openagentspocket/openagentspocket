// The files a Grok Build edit or write changes, from the ACP diff items in a tool record's
// `content`: `{type: diff, path, oldText, newText, _meta}` (Swift GrokFileChanges).
//
// A result's item lists the edits Grok applied in `_meta.details`: each replaced string where it
// starts, with up to three whole lines of context around it and the text before it on its first
// line (`line_prefix`). Hunks are built from them as Grok's pager does (`build_diff_hunks`). An
// input update's item previews the edit before it runs: the old and new text, and in `_meta` the
// line it starts on, which the pager diffs line by line (`diff_hunks_from_strings`).

import { emptyFileChanges, fileChangeFromHunks, MAXIMUM_FILE_CHANGES } from '../model/preview';
import { asArray, asObject, asString, type JsonObject } from '../model/reducer';
import type { ChatDiffHunk, ChatFileChanges, FileChangeKind } from '../model/types';
import { lineDiff, type Tag } from './line-diff';

/** The unchanged lines the pager keeps on each side of a change. */
const CONTEXT = 3;

interface Row {
  tag: Tag;
  /** The line with its newline, as the diff split it. */
  text: string;
  old: number;
  new: number;
}

/** One `SearchReplaceEditDetail`. Every field but `line_prefix` is required: the pager skips details missing one. */
interface Detail {
  oldString: string;
  oldLine: number;
  newString: string;
  newLine: number;
  contextBefore: string;
  contextAfter: string;
  linePrefix: string;
}

/** A 1-based line number, which JSON decodes as a double. */
function lineNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/** `text`'s lines, each with its newline, as the pager splits them; a last line without one is a line too. */
function splitLines(text: string): string[] {
  const lines: string[] = [];
  let start = 0;
  for (let index = text.indexOf('\n'); index >= 0; index = text.indexOf('\n', start)) {
    lines.push(text.slice(start, index + 1));
    start = index + 1;
  }
  if (start < text.length) lines.push(text.slice(start));
  return lines;
}

/** Only ASCII whitespace, as the pager's `trim_ascii` reads a blank line. */
const isBlank = (line: string) => /^[ \t\n\r\f]*$/.test(line);

const withoutTrailingLineBreaks = (text: string) => text.replace(/[\r\n]+$/, '');

function advance(tag: Tag, position: { old: number; new: number }): void {
  if (tag !== 'insert') position.old += 1;
  if (tag !== 'delete') position.new += 1;
}

function details(value: unknown): Detail[] {
  const items = asArray(value);
  if (items === null) return [];
  const result: Detail[] = [];
  for (const raw of items) {
    const item = asObject(raw);
    const oldString = asString(item?.old_string);
    const oldLine = lineNumber(item?.old_line);
    const newString = asString(item?.new_string);
    const newLine = lineNumber(item?.new_line);
    const contextBefore = asString(item?.context_before);
    const contextAfter = asString(item?.context_after);
    if (
      oldString === null ||
      oldLine === null ||
      newString === null ||
      newLine === null ||
      contextBefore === null ||
      contextAfter === null
    ) {
      return [];
    }
    result.push({
      oldString,
      oldLine,
      newString,
      newLine,
      contextBefore,
      contextAfter,
      linePrefix: asString(item?.line_prefix) ?? '',
    });
  }
  return result;
}

/** One detail's rows: context before, the line diff, context after, trimmed to `CONTEXT` unchanged lines and no blank ones at either end. Null when nothing changed. */
function detailRows(detail: Detail): Row[] | null {
  const rows: Row[] = [];
  const before = splitLines(detail.contextBefore);
  before.forEach((text, index) => {
    // The last line of the context sits just above the edit.
    const fromEnd = before.length - index;
    rows.push({
      tag: 'equal',
      text,
      old: Math.max(detail.oldLine - fromEnd, 0),
      new: Math.max(detail.newLine - fromEnd, 0),
    });
  });
  // A blank line inserted mid-file records two empty strings.
  const insertsBlankLine =
    detail.oldString === '' &&
    detail.newString === '' &&
    (detail.contextBefore !== '' || detail.contextAfter !== '');
  const newText = insertsBlankLine ? '\n' : detail.newString;
  const position = { old: detail.oldLine, new: detail.newLine };
  // A match that starts mid-line lacks the text before it on that line: the first removed and the
  // first added line get it back.
  let prefixedOld = false;
  let prefixedNew = false;
  for (const change of lineDiff(splitLines(detail.oldString), splitLines(newText))) {
    let text = change.text;
    if (detail.linePrefix !== '') {
      const needsPrefix =
        change.tag === 'delete'
          ? !prefixedOld
          : change.tag === 'insert'
            ? !prefixedNew
            : !prefixedOld && !prefixedNew;
      if (needsPrefix) text = detail.linePrefix + text;
      if (change.tag === 'insert') prefixedNew = true;
      else prefixedOld = true;
    }
    rows.push({ tag: change.tag, text, old: position.old, new: position.new });
    advance(change.tag, position);
  }
  for (const text of splitLines(detail.contextAfter)) {
    rows.push({ tag: 'equal', text, old: position.old, new: position.new });
    position.old += 1;
    position.new += 1;
  }
  if (!rows.some((row) => row.tag !== 'equal')) return null;
  let equalBefore = 0;
  while (equalBefore < rows.length && rows[equalBefore]?.tag === 'equal') equalBefore += 1;
  let equalAfter = 0;
  while (equalAfter < rows.length && rows[rows.length - 1 - equalAfter]?.tag === 'equal') {
    equalAfter += 1;
  }
  let start = Math.max(equalBefore - CONTEXT, 0);
  let end = rows.length - Math.max(equalAfter - CONTEXT, 0);
  while (start < end && rows[start]?.tag === 'equal' && isBlank(rows[start]?.text ?? ''))
    start += 1;
  while (start < end && rows[end - 1]?.tag === 'equal' && isBlank(rows[end - 1]?.text ?? '')) {
    end -= 1;
  }
  return start < end ? rows.slice(start, end) : null;
}

/**
 * The old and new text diffed line by line from `startLine`, in groups of changes with `CONTEXT`
 * unchanged lines around them; a stretch of more than twice that unchanged starts another group.
 */
function groupedRows(oldText: string, newText: string, startLine: number): Row[][] {
  const rows: Row[] = [];
  const position = { old: startLine, new: startLine };
  for (const change of lineDiff(splitLines(oldText), splitLines(newText))) {
    rows.push({ tag: change.tag, text: change.text, old: position.old, new: position.new });
    advance(change.tag, position);
  }
  const groups: Row[][] = [];
  let start: number | null = null;
  let lastChange: number | null = null;
  rows.forEach((row, index) => {
    if (row.tag === 'equal') return;
    if (start !== null && lastChange !== null && index - lastChange - 1 > 2 * CONTEXT) {
      groups.push(rows.slice(start, lastChange + CONTEXT + 1));
      start = index - CONTEXT;
    } else if (start === null) {
      start = Math.max(index - CONTEXT, 0);
    }
    lastChange = index;
  });
  if (start !== null && lastChange !== null) {
    groups.push(rows.slice(start, Math.min(lastChange + CONTEXT, rows.length - 1) + 1));
  }
  return groups;
}

/** The rows as a hunk. A side with no lines names the line before the change, as a unified diff does. */
function hunk(rows: Row[]): ChatDiffHunk | null {
  const first = rows[0];
  if (!first) return null;
  const oldLines = rows.filter((row) => row.tag !== 'insert').length;
  const newLines = rows.filter((row) => row.tag !== 'delete').length;
  const oldStart =
    oldLines === 0
      ? Math.max(first.old - 1, 0)
      : (rows.find((row) => row.tag !== 'insert')?.old ?? first.old);
  const newStart =
    newLines === 0
      ? Math.max(first.new - 1, 0)
      : (rows.find((row) => row.tag !== 'delete')?.new ?? first.new);
  const lines = rows.map((row) => {
    const sign = row.tag === 'equal' ? ' ' : row.tag === 'delete' ? '-' : '+';
    return sign + withoutTrailingLineBreaks(row.text);
  });
  return { oldStart, oldLines, newStart, newLines, lines };
}

function fileOf(item: JsonObject): ReturnType<typeof fileChangeFromHunks> | null {
  const path = asString(item.path);
  const newText = asString(item.newText);
  if (path === null || path === '' || newText === null) return null;
  const oldText = asString(item.oldText) ?? '';
  // Grok creates a file through an edit whose old text is empty.
  const kind: FileChangeKind = oldText === '' ? 'created' : 'updated';
  const meta = asObject(item._meta);
  const listed = details(meta?.details);
  const groups =
    listed.length === 0
      ? groupedRows(oldText, newText, lineNumber(meta?.new_line) ?? 1)
      : listed.flatMap((detail) => {
          const rows = detailRows(detail);
          return rows === null ? [] : [rows];
        });
  const hunks = groups.flatMap((rows) => {
    const built = hunk(rows);
    return built === null ? [] : [built];
  });
  // A created file may be empty; any other change shows some lines.
  if (hunks.length === 0 && kind !== 'created') return null;
  return fileChangeFromHunks(path, kind, hunks);
}

/** Null when `content` holds no diff item a row can show. */
export function changesFromContent(content: unknown): ChatFileChanges | null {
  const items = asArray(content);
  if (items === null) return null;
  const changes = emptyFileChanges(null);
  for (const raw of items) {
    const item = asObject(raw);
    if (item === null || asString(item.type) !== 'diff') continue;
    const file = fileOf(item);
    if (file === null) continue;
    if (changes.files.length < MAXIMUM_FILE_CHANGES) changes.files.push(file);
    else changes.moreFiles += 1;
  }
  return changes.files.length === 0 && changes.moreFiles === 0 ? null : changes;
}

/** The change a `SearchReplace` result's `EditsApplied` records, for a result whose `content` holds no diff item. */
export function changesFromApplied(applied: unknown): ChatFileChanges | null {
  const object = asObject(applied);
  const path = asString(object?.absolute_path);
  if (object === null || path === null) return null;
  const item: Record<string, unknown> = { type: 'diff', path };
  if (object.old_string !== undefined) item.oldText = object.old_string;
  if (object.new_string !== undefined) item.newText = object.new_string;
  const listed = asObject(object.edits)?.details;
  if (listed !== undefined) item._meta = { details: listed };
  return changesFromContent([item]);
}
