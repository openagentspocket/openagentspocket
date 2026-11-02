import {
  allAddedChange,
  capPreview,
  emptyFileChanges,
  fileChangeFromHunks,
  MAXIMUM_FILE_CHANGES,
} from '../model/preview';
import { asArray, asBool, asInt, asObject, asString, type JsonObject } from '../model/reducer';
import type { ChatDiffHunk, ChatFileChanges } from '../model/types';
import type { ClaudeTodo, ClaudeToolUseResult } from './record-types';
import { previewJoining } from './text';

export function strings(value: unknown): string[] | null {
  const array = asArray(value);
  if (!array) return null;
  const out: string[] = [];
  for (const item of array) {
    const text = asString(item);
    if (text === null) return null;
    out.push(text);
  }
  return out;
}

export function decodeTodos(value: unknown): ClaudeTodo[] | null {
  const array = asArray(value);
  if (!array) return null;
  const todos: ClaudeTodo[] = [];
  for (const item of array) {
    const content = asString(asObject(item)?.content);
    if (content !== null) todos.push({ content, status: asString(asObject(item)?.status) });
  }
  return todos;
}

/** A message `content`: a bare string is one text block. */
export function rawBlocks(value: unknown): JsonObject[] | null {
  const text = asString(value);
  if (text !== null) return [{ type: 'text', text }];
  const array = asArray(value);
  return array ? array.map((item) => asObject(item) ?? {}) : null;
}

export function decodeHunks(value: unknown): ChatDiffHunk[] | null {
  const array = asArray(value);
  if (!array) return null;
  return array.map((item) => {
    const raw = asObject(item) ?? {};
    return {
      oldStart: asInt(raw.oldStart) ?? 0,
      oldLines: asInt(raw.oldLines) ?? 0,
      newStart: asInt(raw.newStart) ?? 0,
      newLines: asInt(raw.newLines) ?? 0,
      lines: strings(raw.lines) ?? [],
    };
  });
}

function bashEditChanges(value: unknown, directory: string | null): ChatFileChanges | null {
  const raw = asObject(value);
  if (!raw) return null;
  const changes: ChatFileChanges = {
    ...emptyFileChanges(directory),
    moreFiles: Math.max(asInt(raw.moreFiles) ?? 0, 0),
    isShared: asBool(raw.shared) ?? false,
    isUnavailable: asBool(raw.unavailable) ?? false,
    isSkipped: asBool(raw.skipped) ?? false,
  };
  for (const item of asArray(raw.files) ?? []) {
    const file = asObject(item) ?? {};
    const path = asString(file.filePath);
    if (!path) continue;
    if (changes.files.length >= MAXIMUM_FILE_CHANGES) {
      changes.moreFiles += 1;
      continue;
    }
    const kind = asBool(file.created) ? 'created' : asBool(file.deleted) ? 'deleted' : 'updated';
    changes.files.push(fileChangeFromHunks(path, kind, decodeHunks(file.hunks) ?? []));
  }
  const any =
    changes.files.length > 0 ||
    changes.moreFiles > 0 ||
    changes.isShared ||
    changes.isUnavailable ||
    changes.isSkipped;
  return any ? changes : null;
}

export function decodeToolUseResult(
  value: unknown,
  directory: string | null,
): ClaudeToolUseResult | null {
  const raw = asObject(value);
  if (!raw) return null;
  const result: ClaudeToolUseResult = {
    commandOutput: null,
    isInterrupted: asBool(raw.interrupted) ?? false,
    backgroundTaskID: asString(raw.backgroundTaskId),
    persistedOutputPath: asString(raw.persistedOutputPath),
    type: asString(raw.type),
    filePath: asString(raw.filePath),
    diff: null,
    fileChanges: null,
    status: asString(raw.status),
    agentID: asString(raw.agentId),
    teammateName: asString(raw.name),
    taskID: asString(raw.taskId),
    taskType: asString(raw.taskType),
    workflowName: asString(raw.workflowName),
    runID: asString(raw.runId),
    workflowSummary: asString(raw.summary),
    agentReport: null,
    answers: {},
    plan: asString(raw.plan),
    todos: decodeTodos(raw.newTodos),
  };
  const output = [asString(raw.stdout), asString(raw.stderr)].flatMap((part) =>
    part ? [part] : [],
  );
  if (output.length > 0) result.commandOutput = previewJoining(output);
  const contentText = asString(raw.content);
  const patch = decodeHunks(raw.structuredPatch);
  if (patch && patch.length > 0) {
    const change = fileChangeFromHunks(asString(raw.filePath) ?? '', 'updated', patch);
    result.diff = { added: change.added, removed: change.removed, files: 1 };
    result.fileChanges = { ...emptyFileChanges(directory), files: [change] };
  } else if (asString(raw.type) === 'create' && contentText !== null) {
    const change = allAddedChange(asString(raw.filePath) ?? '', contentText, 'created');
    result.diff = { added: change.added, removed: 0, files: 1 };
    result.fileChanges = { ...emptyFileChanges(directory), files: [change] };
  }
  const edits = bashEditChanges(raw.bashEditDiff, directory);
  if (edits) result.fileChanges = edits;
  if (contentText === null) {
    const report = (rawBlocks(raw.content) ?? []).flatMap((block) =>
      asString(block.type) === 'text' ? (asString(block.text) ?? []) : [],
    );
    if (report.length > 0) result.agentReport = capPreview(report.join('\n'));
  }
  const answers = asObject(raw.answers);
  if (answers) {
    const entries = Object.entries(answers);
    if (entries.every(([, v]) => typeof v === 'string')) {
      result.answers = Object.fromEntries(entries as [string, string][]);
    }
  }
  return result;
}
