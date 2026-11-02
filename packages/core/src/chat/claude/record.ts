// Decodes one transcript line into a record or metadata (Swift ClaudeLine / ClaudeRecord).
// Decoding is lenient: a wrongly typed field reads as absent, an unknown shape never throws.

import { question } from '../model/factories';
import type { ChatLine } from '../model/lines';
import { isTruncatedLine, lineText } from '../model/lines';
import { capPreview } from '../model/preview';
import { asArray, asBool, asInt, asObject, asString, type JsonObject } from '../model/reducer';
import type { ChatQuestion, ChatToolPreview } from '../model/types';
import { decodeTodos, decodeToolUseResult, rawBlocks } from './record-result';
import { decodeAttachment, decodeSystem } from './record-system';
import type {
  ClaudeContentBlock,
  ClaudeLine,
  ClaudeMetadata,
  ClaudeRecord,
  ClaudeRecordKind,
  ClaudeToolInput,
  ClaudeToolResultDetails,
} from './record-types';

export const CHAIN_TYPES: ReadonlySet<string> = new Set([
  'user',
  'assistant',
  'system',
  'attachment',
  'progress',
]);

export const KNOWN_METADATA_TYPES: ReadonlySet<string> = new Set([
  'last-prompt',
  'custom-title',
  'ai-title',
  'tag',
  'relocated',
  'agent-name',
  'agent-color',
  'agent-setting',
  'mode',
  'permission-mode',
  'isolation-latch',
  'dev-mods',
  'memory-mode',
  'atis-latch',
  'worktree-state',
  'pr-link',
  'frame-link',
  'file-history-snapshot',
  'file-history-delta',
  'continued-in',
  'content-replacement',
  'api-request-shape',
  'api-request-blob',
  'fork-context-ref',
  'ended-by-model',
  'history-suppression',
  'attribution-snapshot',
  'cost-state',
  'queue-operation',
  'observer-ref',
  'summary',
]);

function decodeQuestions(value: unknown): ChatQuestion[] {
  const out: ChatQuestion[] = [];
  for (const item of asArray(value) ?? []) {
    const raw = asObject(item);
    const text = asString(raw?.question);
    if (!raw || text === null) continue;
    const options: ChatQuestion['options'] = [];
    for (const option of asArray(raw.options) ?? []) {
      const object = asObject(option);
      const label = object ? asString(object.label) : asString(option);
      if (label !== null)
        options.push({ label, detail: object ? asString(object.description) : null });
    }
    out.push(
      question({
        header: asString(raw.header),
        text,
        options,
        isMultiSelect: asBool(raw.multiSelect) ?? false,
      }),
    );
  }
  return out;
}

function decodeInput(value: unknown): ClaudeToolInput {
  const raw = asObject(value);
  if (!raw) return emptyInput();
  const filePath = asString(raw.file_path);
  const taskID =
    asString(raw.taskId) ?? (asInt(raw.taskId) === null ? null : String(asInt(raw.taskId)));
  return {
    command: asString(raw.command),
    description: asString(raw.description),
    filePath: filePath ?? asString(raw.notebook_path),
    path: asString(raw.path),
    pattern: asString(raw.pattern),
    url: asString(raw.url),
    query: asString(raw.query),
    prompt: asString(raw.prompt),
    subagentType: asString(raw.subagent_type),
    plan: asString(raw.plan),
    planFilePath: asString(raw.planFilePath),
    questions: decodeQuestions(raw.questions),
    todos: decodeTodos(raw.todos),
    skill: asString(raw.skill),
    arguments: asString(raw.args),
    teammateName: asString(raw.name),
    subject: asString(raw.subject),
    taskID,
    status: asString(raw.status),
    planContent: filePath?.includes('/.claude/plans/') ? asString(raw.content) : null,
  };
}

export function emptyInput(): ClaudeToolInput {
  return {
    command: null,
    description: null,
    filePath: null,
    path: null,
    pattern: null,
    url: null,
    query: null,
    prompt: null,
    subagentType: null,
    plan: null,
    planFilePath: null,
    questions: [],
    todos: null,
    skill: null,
    arguments: null,
    teammateName: null,
    subject: null,
    taskID: null,
    status: null,
    planContent: null,
  };
}

function decodeBlock(raw: JsonObject): ClaudeContentBlock {
  const type = asString(raw.type);
  switch (type) {
    case 'text':
      return { type: 'text', text: asString(raw.text) ?? '' };
    case 'thinking':
      return { type: 'thinking', text: asString(raw.thinking) ?? '' };
    case 'redacted_thinking':
      return { type: 'redactedThinking' };
    case 'tool_use':
    case 'server_tool_use':
      return {
        type: 'toolUse',
        use: {
          id: asString(raw.id) ?? '',
          name: asString(raw.name) ?? '',
          input: decodeInput(raw.input),
        },
      };
    case 'tool_result': {
      const parts = rawBlocks(raw.content) ?? [];
      const text = parts
        .filter((part) => asString(part.type) === 'text')
        .flatMap((part) => asString(part.text) ?? [])
        .join('\n');
      const imageCount = parts.filter((part) => asString(part.type) === 'image').length;
      return {
        type: 'toolResult',
        result: {
          toolUseID: asString(raw.tool_use_id) ?? '',
          isError: asBool(raw.is_error) ?? false,
          content: capPreview(text, imageCount),
        },
      };
    }
    case 'image':
      return { type: 'image' };
    case 'fallback':
      return {
        type: 'fallback',
        from: asString(asObject(raw.from)?.model),
        to: asString(asObject(raw.to)?.model),
      };
    default:
      return { type: 'other', name: type ?? '' };
  }
}

/** Prompt tokens of a request: input plus cache reads and creation, negatives counted as 0. */
export function claudePromptTokens(
  input: number | null,
  cacheRead: number | null,
  cacheCreation: number | null,
): number | null {
  const parts = [input, cacheRead, cacheCreation].flatMap((part) => (part === null ? [] : [part]));
  if (parts.length === 0) return null;
  const total = parts.reduce((sum, part) => sum + Math.max(0, part), 0);
  return total > 0 ? total : null;
}

function baseRecord(
  raw: JsonObject,
  uuid: string,
  kind: ClaudeRecordKind,
  line: ChatLine,
): ClaudeRecord {
  return {
    uuid,
    parentUUID: asString(raw.parentUuid),
    kind,
    byteOffset: line.offset,
    byteLength: line.length,
    isSidechain: asBool(raw.isSidechain) ?? false,
    isMeta: asBool(raw.isMeta) ?? false,
    teamName: asString(raw.teamName),
    agentID: asString(raw.agentId),
    sessionID: asString(raw.sessionId),
    timestamp: asString(raw.timestamp),
    blocks: [],
    messageID: null,
    apiBlockIndex: null,
    thinkingDurationMilliseconds: null,
    isAPIError: false,
    promptSource: null,
    originKind: null,
    sourceToolUseID: null,
    isCompactSummary: false,
    interruptedMessageID: null,
    toolResult: null,
    cwd: null,
    contextSample: null,
    system: null,
    attachment: null,
  };
}

function decodeRecord(raw: JsonObject, type: string, uuid: string, line: ChatLine): ClaudeRecord {
  const subtype = asString(raw.subtype) ?? '';
  const attachmentType = asString(asObject(raw.attachment)?.type) ?? '';
  const kind: ClaudeRecordKind =
    type === 'user'
      ? { type: 'user' }
      : type === 'assistant'
        ? { type: 'assistant' }
        : type === 'system'
          ? { type: 'system', subtype }
          : type === 'attachment'
            ? { type: 'attachment', subtype: attachmentType }
            : { type: 'progress' };
  const record = baseRecord(raw, uuid, kind, line);
  if (kind.type === 'user' || kind.type === 'assistant') {
    const message = asObject(raw.message);
    record.blocks = (rawBlocks(message?.content) ?? []).map(decodeBlock);
    record.messageID = asString(message?.id);
    const usage = asObject(message?.usage);
    if (kind.type === 'assistant' && usage) {
      const tokens = claudePromptTokens(
        asInt(usage.input_tokens),
        asInt(usage.cache_read_input_tokens),
        asInt(usage.cache_creation_input_tokens),
      );
      if (tokens !== null)
        record.contextSample = { promptTokens: tokens, model: asString(message?.model) };
    }
    record.apiBlockIndex = asInt(raw.apiBlockIndex);
    record.thinkingDurationMilliseconds = asInt(raw.thinkingDurationMs);
    record.isAPIError = asBool(raw.isApiErrorMessage) ?? false;
    record.promptSource = asString(raw.promptSource);
    record.originKind = asString(asObject(raw.origin)?.kind);
    record.sourceToolUseID = asString(raw.sourceToolUseID);
    record.isCompactSummary =
      (asBool(raw.isCompactSummary) ?? false) || (asBool(raw.isVisibleInTranscriptOnly) ?? false);
    record.interruptedMessageID = asString(raw.interruptedMessageId);
    record.cwd = asString(raw.cwd);
    if (record.blocks.some((block) => block.type === 'toolResult')) {
      const unanswered =
        asBool(raw.toolDenialUnanswered) ?? (asString(raw.toolDenialUnanswered) ?? '') !== '';
      const result: ClaudeToolResultDetails = {
        denialKind: asString(raw.toolDenialKind),
        userFeedback: asString(raw.userFeedback),
        isDenialUnanswered: unanswered,
        result: decodeToolUseResult(raw.toolUseResult, record.cwd),
      };
      record.toolResult = result;
    }
  } else if (kind.type === 'system') {
    record.system = decodeSystem(raw);
  } else if (kind.type === 'attachment') {
    record.attachment = decodeAttachment(raw, attachmentType);
  }
  return record;
}

function decodeMetadata(raw: JsonObject, type: string): ClaudeMetadata {
  const other: ClaudeMetadata = { type: 'other', name: type };
  const keyed = (
    key: string,
    kind: 'customTitle' | 'aiTitle' | 'summary' | 'permissionMode' | 'relocated' | 'continuedIn',
  ): ClaudeMetadata => {
    const value = asString(raw[key]);
    return value === null ? other : { type: kind, value };
  };
  switch (type) {
    case 'custom-title':
      return keyed('customTitle', 'customTitle');
    case 'ai-title':
      return keyed('aiTitle', 'aiTitle');
    case 'summary':
      return keyed('summary', 'summary');
    case 'permission-mode':
      return keyed('permissionMode', 'permissionMode');
    case 'relocated':
      return keyed('relocatedCwd', 'relocated');
    case 'continued-in':
      return keyed('continuedInSessionId', 'continuedIn');
    case 'queue-operation': {
      const operation = asString(raw.operation);
      return operation === null
        ? other
        : {
            type: 'queueOperation',
            operation,
            content: asString(raw.content),
            timestamp: asString(raw.timestamp),
          };
    }
    default:
      return other;
  }
}

export function decodeClaudeLine(line: ChatLine): ClaudeLine {
  if (isTruncatedLine(line)) return { type: 'invalid' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(lineText(line));
  } catch {
    return { type: 'invalid' };
  }
  const raw = asObject(parsed);
  const type = asString(raw?.type);
  if (!raw || type === null) return { type: 'invalid' };
  const uuid = asString(raw.uuid);
  if (CHAIN_TYPES.has(type)) {
    return uuid === null
      ? { type: 'invalid' }
      : { type: 'record', record: decodeRecord(raw, type, uuid, line) };
  }
  if (uuid !== null && 'parentUuid' in raw && !KNOWN_METADATA_TYPES.has(type)) {
    return { type: 'record', record: baseRecord(raw, uuid, { type: 'unknown', name: type }, line) };
  }
  return { type: 'metadata', metadata: decodeMetadata(raw, type) };
}

export type { ChatToolPreview };
