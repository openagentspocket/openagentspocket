// Prompts the user typed, as recorded in the transcript, and the ones still waiting in Claude's
// queue (Swift ClaudeTranscriptProjection: recordedPrompts, waitingEnqueues, typedText).

import { trimSpaces } from '../../hosts/text';
import { capPreview } from '../model/preview';
import type { ChatRecordedPrompt } from '../model/types';
import type { ClaudeTranscriptIndex, QueueOperation } from './index-store';
import {
  type ClaudeRecord,
  imageCountOf,
  isAttachment,
  isSystem,
  textsOf,
  toolResultsOf,
} from './record-types';
import { classifyUserText, echoKey, isMarker } from './user-text';

export const VISIBLE_META_ORIGINS: ReadonlySet<string> = new Set([
  'channel',
  'observer',
  'observer-activity',
  'slack-ping',
  'peer',
]);
export const TYPED_PROMPT_SOURCES: ReadonlySet<string> = new Set(['typed', 'queued']);
const IMAGE_SOURCE_PREFIX = '[Image: source: ';
const UNKNOWN_COMMAND_PREFIX = 'Unknown command: ';
const UNKNOWN_SKILL_ARGUMENTS_PREFIX = 'Args from unknown skill: ';
const IMAGE_PLACEHOLDER = /\[Image #[0-9]+\]/g;

export function isHuman(originKind: string | null): boolean {
  return originKind === null || originKind === 'human';
}

export function unknownCommand(record: ClaudeRecord): string | null {
  const content = record.system?.content;
  if (!isSystem(record, 'informational') || !content?.startsWith(UNKNOWN_COMMAND_PREFIX))
    return null;
  return trimSpaces(content.slice(UNKNOWN_COMMAND_PREFIX.length));
}

export function unknownSkillArguments(record: ClaudeRecord, parent: ClaudeRecord): string | null {
  const content = record.system?.content;
  if (
    !isSystem(record, 'informational') ||
    record.parentUUID !== parent.uuid ||
    !content?.startsWith(UNKNOWN_SKILL_ARGUMENTS_PREFIX)
  ) {
    return null;
  }
  return trimSpaces(content.slice(UNKNOWN_SKILL_ARGUMENTS_PREFIX.length));
}

/** The prompt a user or command record carries: plain text, a slash command or a `!` shell line. */
export function promptText(text: string): string | null {
  if (isMarker(text.trim())) return null;
  const classified = classifyUserText(text);
  switch (classified.type) {
    case 'prompt':
      return classified.text === '' ? null : classified.text;
    case 'command': {
      const { name, arguments: args } = classified.invocation;
      return args === '' ? `/${name}` : `/${name} ${args}`;
    }
    case 'bashInput':
      return classified.text === '' ? null : `!${classified.text}`;
    default:
      return null;
  }
}

export function typedText(
  record: ClaudeRecord,
  indexed: ReadonlyMap<string, ClaudeRecord>,
): string | null {
  const kind = record.kind;
  if (kind.type === 'user') {
    if (
      toolResultsOf(record).length > 0 ||
      record.isMeta ||
      record.isCompactSummary ||
      record.sourceToolUseID !== null
    )
      return null;
    if (!isHuman(record.originKind)) return null;
    if (record.promptSource !== null && !TYPED_PROMPT_SOURCES.has(record.promptSource)) return null;
    return promptText(textsOf(record).join('\n'));
  }
  if (isAttachment(record, 'queued_command')) {
    const queued = record.attachment?.queuedCommand;
    if (!queued || queued.isMeta) return null;
    if (queued.commandMode !== null && queued.commandMode !== 'prompt') return null;
    if (!isHuman(queued.originKind)) return null;
    // The user record written for it is recorded instead.
    if (queued.sourceUUID !== null && indexed.has(queued.sourceUUID)) return null;
    return promptText(queued.text);
  }
  if (isSystem(record, 'local_command')) {
    const classified = classifyUserText(record.system?.content ?? '');
    if (classified.type !== 'command') return null;
    const { name, arguments: args } = record.system?.commandRun ?? classified.invocation;
    return args === '' ? `/${name}` : `/${name} ${args}`;
  }
  return null;
}

export function isImagePlaceholder(text: string): boolean {
  return /^\[Image #[0-9]+\]$/.test(text.trim());
}

export function replacingImagePlaceholders(text: string, paths: string[]): string {
  const matches = [...text.matchAll(IMAGE_PLACEHOLDER)];
  if (matches.length === 0 || matches.length !== paths.length) return text;
  let result = '';
  let cursor = 0;
  matches.forEach((match, i) => {
    const at = match.index ?? 0;
    result += text.slice(cursor, at) + (paths[i] as string);
    cursor = at + match[0].length;
  });
  return result + text.slice(cursor);
}

function imageSources(
  byPosition: ClaudeRecord[],
  indexed: ReadonlyMap<string, ClaudeRecord>,
): Map<string, string[]> {
  const sources = new Map<string, string[]>();
  for (const record of byPosition) {
    if (record.kind.type !== 'user' || !record.isMeta) continue;
    const paths = textsOf(record).flatMap((text) => {
      if (!text.startsWith(IMAGE_SOURCE_PREFIX) || !text.endsWith(']')) return [];
      const path = text.slice(IMAGE_SOURCE_PREFIX.length, -1);
      return path === '' ? [] : [path];
    });
    if (paths.length === 0) continue;
    const visited = new Set([record.uuid]);
    let parent = record.parentUUID === null ? undefined : indexed.get(record.parentUUID);
    while (
      parent &&
      (parent.isMeta || parent.kind.type === 'attachment') &&
      !visited.has(parent.uuid)
    ) {
      visited.add(parent.uuid);
      parent = parent.parentUUID === null ? undefined : indexed.get(parent.parentUUID);
    }
    if (
      !parent ||
      visited.has(parent.uuid) ||
      parent.kind.type !== 'user' ||
      imageCountOf(parent) === 0
    )
      continue;
    const list = sources.get(parent.uuid) ?? [];
    list.push(...paths);
    sources.set(parent.uuid, list);
  }
  return sources;
}

export function recordedPrompts(
  index: ClaudeTranscriptIndex,
  entryByRecord: ReadonlyMap<string, string>,
  waiting: ReadonlyMap<number, string> = new Map(),
): ChatRecordedPrompt[] {
  const prompts: { prompt: ChatRecordedPrompt; rawKey: string }[] = [];
  const byPosition = index.recordsByPosition;
  const sourcesByRecord = imageSources(byPosition, index.records);
  byPosition.forEach((record, position) => {
    if (record.isSidechain || record.teamName !== null) return;
    const command = unknownCommand(record);
    if (command !== null) {
      const next = byPosition[position + 1];
      const args = next ? unknownSkillArguments(next, record) : null;
      const text = [command, args].filter((part) => part !== null && part !== '').join(' ');
      prompts.push({
        prompt: {
          offset: record.byteOffset,
          text,
          entryID: entryByRecord.get(record.uuid) ?? null,
          pastedImagePaths: null,
        },
        rawKey: echoKey(text),
      });
      return;
    }
    const raw = typedText(record, index.records);
    if (raw === null) return;
    const sources = sourcesByRecord.get(record.uuid) ?? [];
    prompts.push({
      prompt: {
        offset: record.byteOffset,
        text: sources.length === 0 ? raw : replacingImagePlaceholders(raw, sources),
        entryID: entryByRecord.get(record.uuid) ?? null,
        pastedImagePaths: isImagePlaceholder(raw) ? sources : null,
      },
      rawKey: echoKey(raw),
    });
  });
  // A queued prompt is recorded first as an enqueue and later as the record that delivers it.
  const enqueued: ChatRecordedPrompt[] = [];
  for (const operation of index.queueOperations.values()) {
    if (operation.operation !== 'enqueue' || operation.content === null) continue;
    const text = promptText(operation.content);
    if (text === null) continue;
    const key = echoKey(text);
    const delivery = prompts.find(
      (entry) => entry.prompt.offset > operation.offset && entry.rawKey === key,
    )?.prompt;
    enqueued.push({
      offset: operation.offset,
      text,
      entryID: delivery?.entryID ?? waiting.get(operation.offset) ?? null,
      pastedImagePaths: isImagePlaceholder(text) ? (delivery?.pastedImagePaths ?? []) : null,
    });
  }
  return [...prompts.map((entry) => entry.prompt), ...enqueued].sort((a, b) => a.offset - b.offset);
}

/** Enqueued prompts neither delivered nor taken back. */
export function waitingEnqueues(index: ClaudeTranscriptIndex): { offset: number; text: string }[] {
  const typedKeys: { offset: number; key: string }[] = [];
  for (const record of index.recordsByPosition) {
    if (record.isSidechain || record.teamName !== null) continue;
    const text = typedText(record, index.records);
    if (text !== null) typedKeys.push({ offset: record.byteOffset, key: echoKey(text) });
  }
  const operations = [...index.queueOperations.values()].sort((a, b) => a.offset - b.offset);
  const keyOf = (operation: QueueOperation): string | null => {
    const text = operation.content === null ? null : promptText(operation.content);
    return text === null ? null : echoKey(text);
  };
  const waiting: { offset: number; text: string }[] = [];
  for (const operation of operations) {
    if (operation.operation !== 'enqueue' || operation.content === null) continue;
    const text = promptText(operation.content);
    if (text === null) continue;
    const enqueued = echoKey(text);
    const isDelivered = typedKeys.some(
      (typed) => typed.offset > operation.offset && typed.key === enqueued,
    );
    const isTakenBack = operations.some(
      (other) =>
        other.offset > operation.offset &&
        other.operation !== 'enqueue' &&
        keyOf(other) === enqueued,
    );
    if (!isDelivered && !isTakenBack) waiting.push({ offset: operation.offset, text });
  }
  return waiting;
}

export const COMPACTION_PREAMBLE =
  'This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.';

function indentation(line: string): number {
  let n = 0;
  while (n < line.length && (line[n] === ' ' || line[n] === '\t')) n += 1;
  return n;
}

function outdentingFirstSection(lines: string[]): string[] {
  const firstTop = lines.findIndex((line) => trimSpaces(line) !== '' && indentation(line) === 0);
  const end = firstTop < 0 ? lines.length : firstTop;
  const body = lines.slice(0, end);
  const indents = body.filter((line) => trimSpaces(line) !== '').map(indentation);
  const shift = indents.length === 0 ? 0 : Math.min(...indents);
  if (shift === 0) return lines;
  return [
    ...body.map((line) => line.slice(Math.min(shift, indentation(line)))),
    ...lines.slice(end),
  ];
}

/** A compaction summary without the CLI's boilerplate, starting at the primary request. */
export function compactionPreview(summary: string): string {
  if (!summary.startsWith(COMPACTION_PREAMBLE)) return summary;
  let lines = summary.slice(COMPACTION_PREAMBLE.length).split('\n');
  const dropLeading = (isDropped: (line: string) => boolean) => {
    let n = 0;
    while (n < lines.length && isDropped(trimSpaces(lines[n] as string))) n += 1;
    lines = lines.slice(n);
  };
  dropLeading((line) => line === '');
  dropLeading((line) => line === 'Summary:');
  dropLeading((line) => line === '');
  const heading = '1. Primary Request and Intent:';
  const head = lines[0] === undefined ? undefined : trimSpaces(lines[0]);
  if (head?.startsWith(heading)) {
    const rest = trimSpaces(head.slice(heading.length));
    lines = [...(rest === '' ? [] : [rest]), ...lines.slice(1)];
    dropLeading((line) => line === '');
    lines = outdentingFirstSection(lines);
  }
  const remainder = lines.join('\n').trim();
  return remainder === '' ? summary : remainder;
}

/** Markdown as plain lines for a divider preview: headings without `#`, no blank lines. */
export function plainLines(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) => line.replace(/^\s{0,3}#{1,6}\s+/, '').trimEnd())
    .filter((line) => line.trim() !== '')
    .join('\n');
}

export function compactionDetail(summary: string | null): string | null {
  if (summary === null) return null;
  const preview = capPreview(plainLines(summary)).text;
  return preview === '' ? null : preview;
}

export function modelChangeTitle(from: string | null, to: string | null): string {
  if (from !== null && to !== null) return `Switched from ${from} to ${to}`;
  if (to !== null) return `Switched to ${to}`;
  return 'Switched model';
}

export function dateOf(timestamp: string | null): string | null {
  if (!timestamp) return null;
  const ms = Date.parse(timestamp);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

export { UNKNOWN_COMMAND_PREFIX, UNKNOWN_SKILL_ARGUMENTS_PREFIX };
