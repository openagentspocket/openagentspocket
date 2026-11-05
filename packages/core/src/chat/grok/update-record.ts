// One line of a Grok Build session's `updates.jsonl`, decoded down to what Chat projects (Swift
// GrokUpdateRecord). Each line is an ACP `session/update`, or Grok's own `_x.ai/session/update`:
// `params.update.sessionUpdate` names its kind, and `params._meta` carries its event id and Grok's
// clock. Neither the line nor an image's data is kept.

import { decodeUtf8 } from '../../events/utf8';
import { repairedJsonPrefix } from '../model/json-prefix';
import { type ChatLine, isTruncatedLine } from '../model/lines';
import { asObject, asString, type JsonObject } from '../model/reducer';
import type { ChatToolPreview } from '../model/types';
import { type GrokTool, parseTool } from './tool-record';
import { integer, previewOf } from './values';

/** An `eventId`, `<session>-<n>`: only split prompts compare it; Grok numbers events again after a rewind. */
export interface EventNumber {
  prefix: string;
  number: number;
}

export function parseEventNumber(eventID: string): EventNumber | null {
  const dash = eventID.lastIndexOf('-');
  if (dash < 0) return null;
  const digits = eventID.slice(dash + 1);
  if (!/^[+-]?\d+$/.test(digits)) return null;
  return { prefix: eventID.slice(0, dash), number: Number(digits) };
}

/** One content block of a prompt. */
export interface UserChunk {
  /** `text`, `image` or another ACP block type. */
  contentType: string | null;
  text: string | null;
  /** What Grok shows instead of `text`: a skill's `/name args`, or an interjection's own words. */
  displayText: string | null;
  displayAsSkill: boolean;
  /** The command a `!cmd` typed in Grok's shell mode ran. */
  bashCommand: string | null;
  /** Counts submitted prompts from 0. Null for an interjection and a shell-mode command, and when a cut line lost it. */
  promptIndex: number | null;
  /** A prompt Grok wrote for itself (`hideFromScrollback`): a task, subagent or notification wake-up. */
  isHidden: boolean;
}

/** A message or thought block, or one part of it. */
export interface AgentChunk {
  text: string | null;
  /** Consecutive within one block. */
  chunkID: number | null;
}

export interface TurnCompleted {
  stopReason: string | null;
  /** The error's text when `stopReason` is `error`. */
  agentResult: string | null;
  elapsedMilliseconds: number | null;
  /** What cancelled the turn (`params._meta`). */
  cancelTrigger: string | null;
  cancellationCategory: string | null;
}

export type Retry =
  | { kind: 'retrying' }
  | { kind: 'exhausted'; attempts: number | null; reason: string | null }
  | { kind: 'failed'; message: string | null };

/** A command or monitor Grok runs in the background (`task_backgrounded`). */
export interface TaskBackgrounded {
  callID: string | null;
  taskID: string | null;
}

/** A background command or monitor that ended (`task_completed`). */
export interface TaskCompleted {
  taskID: string | null;
  /** `bash` for a command, `monitor` for a monitor. */
  taskKind: string | null;
  /** What the user saw run: `display_command`, else `command`. */
  command: string | null;
  exitCode: number | null;
  signal: string | null;
  /** Grok stopped it on request (`explicitly_killed`). */
  wasKilled: boolean;
  /** The start of its output. */
  preview: ChatToolPreview | null;
}

export interface SubagentSpawned {
  subagentID: string | null;
  subagentType: string | null;
  description: string | null;
}

export interface SubagentFinished {
  subagentID: string | null;
  /** `completed`, `failed` or `cancelled`. */
  status: string | null;
  error: string | null;
  toolCalls: number | null;
  turns: number | null;
  durationMilliseconds: number | null;
  /** The start of the subagent's report. */
  preview: ChatToolPreview | null;
}

export type GrokRecordKind =
  | { type: 'userChunk'; chunk: UserChunk }
  | { type: 'agentMessage'; chunk: AgentChunk }
  | { type: 'agentThought'; chunk: AgentChunk }
  /** `tool` is null when the record names no call. */
  | { type: 'toolCall'; tool: GrokTool | null }
  | { type: 'toolUpdate'; tool: GrokTool | null }
  | { type: 'turnCompleted'; end: TurnCompleted }
  | { type: 'rewind'; targetPromptIndex: number | null }
  | { type: 'compactionCheckpoint' }
  | { type: 'compactionCancelled' }
  | { type: 'compactionFailed'; error: string | null }
  | { type: 'retry'; retry: Retry }
  | { type: 'imageDropped'; notes: string[] }
  | { type: 'taskBackgrounded'; task: TaskBackgrounded }
  | { type: 'taskCompleted'; end: TaskCompleted }
  | { type: 'subagentSpawned'; spawned: SubagentSpawned }
  | { type: 'subagentFinished'; finished: SubagentFinished }
  /** A kind Chat shows nothing for. */
  | { type: 'skipped'; name: string }
  /** A kind this build does not know. */
  | { type: 'unknown'; name: string };

export interface GrokUpdateRecord {
  offset: number;
  length: number;
  /** The line was longer than the reader keeps. Fields after the cut are missing, `params._meta` among them. */
  isTruncated: boolean;
  /** Seconds, on the Host's clock. */
  timestamp: number | null;
  agentTimestampMs: number | null;
  /** When the turn an agent record belongs to started. */
  turnStartMs: number | null;
  /** `params._meta.promptId`, which agent records carry. */
  promptID: string | null;
  eventNumber: EventNumber | null;
  kind: GrokRecordKind;
}

/** Kinds that show nothing: hooks, Grok's bookkeeping, and `plan`, whose snapshot the `todo_write` row covers. */
const SKIPPED_KINDS = new Set([
  'plan',
  'hook_execution',
  'background_tasks',
  'session_recap',
  'response_started',
  'turn_usage',
  'model_changed',
  'served_model',
  'available_commands_update',
  'current_mode_update',
  'image_compressed',
  'session_start',
  'auto_compact_started',
  'auto_compact_completed',
]);

const object = (value: unknown): JsonObject | null => asObject(value);

function agentChunk(update: JsonObject, meta: JsonObject | null): AgentChunk {
  return {
    text: asString(object(update.content)?.text),
    chunkID: integer(meta?.chunkId),
  };
}

function kindOf(type: string, update: JsonObject, meta: JsonObject | null): GrokRecordKind {
  switch (type) {
    case 'user_message_chunk': {
      const content = object(update.content);
      const contentMeta = object(content?._meta);
      const updateMeta = object(update._meta);
      return {
        type: 'userChunk',
        chunk: {
          contentType: asString(content?.type),
          text: asString(content?.text),
          displayText: asString(contentMeta?.displayText),
          displayAsSkill: contentMeta?.displayAsSkill === true,
          bashCommand: asString(contentMeta?.bash_command),
          promptIndex: integer(updateMeta?.promptIndex),
          isHidden: updateMeta?.hideFromScrollback === true,
        },
      };
    }
    case 'agent_message_chunk':
      return { type: 'agentMessage', chunk: agentChunk(update, meta) };
    case 'agent_thought_chunk':
      return { type: 'agentThought', chunk: agentChunk(update, meta) };
    case 'tool_call':
      return { type: 'toolCall', tool: parseTool(update) };
    case 'tool_call_update':
      return { type: 'toolUpdate', tool: parseTool(update) };
    case 'turn_completed':
      return {
        type: 'turnCompleted',
        end: {
          stopReason: asString(update.stop_reason),
          agentResult: asString(update.agent_result),
          elapsedMilliseconds: integer(update.elapsed_ms),
          cancelTrigger: asString(meta?.cancelTrigger),
          cancellationCategory: asString(meta?.cancellationCategory),
        },
      };
    case 'rewind_marker':
      return { type: 'rewind', targetPromptIndex: integer(update.target_prompt_index) };
    case 'compaction_checkpoint':
      return { type: 'compactionCheckpoint' };
    case 'auto_compact_cancelled':
      return { type: 'compactionCancelled' };
    case 'auto_compact_failed':
      return { type: 'compactionFailed', error: asString(update.error) };
    case 'retry_state':
      switch (asString(update.type)) {
        case 'exhausted':
          return {
            type: 'retry',
            retry: {
              kind: 'exhausted',
              attempts: integer(update.attempts),
              reason: asString(update.reason),
            },
          };
        case 'failed':
          return { type: 'retry', retry: { kind: 'failed', message: asString(update.message) } };
        default:
          return { type: 'retry', retry: { kind: 'retrying' } };
      }
    case 'image_dropped': {
      const notes = Array.isArray(update.notes) ? update.notes : null;
      return {
        type: 'imageDropped',
        notes:
          notes === null ? [] : notes.filter((note): note is string => typeof note === 'string'),
      };
    }
    case 'task_backgrounded':
      return {
        type: 'taskBackgrounded',
        task: { callID: asString(update.tool_call_id), taskID: asString(update.task_id) },
      };
    case 'task_completed': {
      const task = object(update.task_snapshot);
      return {
        type: 'taskCompleted',
        end: {
          taskID: asString(task?.task_id),
          taskKind: asString(task?.kind),
          command: asString(task?.display_command) ?? asString(task?.command),
          exitCode: integer(task?.exit_code),
          signal: asString(task?.signal),
          wasKilled: task?.explicitly_killed === true,
          preview: previewOf(asString(task?.output)),
        },
      };
    }
    case 'subagent_spawned':
      return {
        type: 'subagentSpawned',
        spawned: {
          subagentID: asString(update.subagent_id),
          subagentType: asString(update.subagent_type),
          description: asString(update.description),
        },
      };
    case 'subagent_finished':
      return {
        type: 'subagentFinished',
        finished: {
          subagentID: asString(update.subagent_id),
          status: asString(update.status),
          error: asString(update.error),
          toolCalls: integer(update.tool_calls),
          turns: integer(update.turns),
          durationMilliseconds: integer(update.duration_ms),
          preview: previewOf(asString(update.output)),
        },
      };
    default:
      return SKIPPED_KINDS.has(type) || type.startsWith('memory_dream_')
        ? { type: 'skipped', name: type }
        : { type: 'unknown', name: type };
  }
}

/** Null when the line is not an update record. */
export function decodeUpdateRecord(line: ChatLine): GrokUpdateRecord | null {
  // A cut line still parses up to its last complete value, which keeps the kind and the fields
  // before a long text or output.
  const truncated = isTruncatedLine(line);
  const data = truncated ? repairedJsonPrefix(line.data) : line.data;
  if (data === null) return null;
  let value: JsonObject | null;
  try {
    value = object(JSON.parse(decodeUtf8(data)));
  } catch {
    return null;
  }
  const params = object(value?.params);
  const update = object(params?.update);
  const type = asString(update?.sessionUpdate);
  if (value === null || update === null || type === null) return null;
  const meta = object(params?._meta);
  const eventID = asString(meta?.eventId);
  return {
    offset: line.offset,
    length: line.length,
    isTruncated: truncated,
    timestamp: integer(value.timestamp),
    agentTimestampMs: integer(meta?.agentTimestampMs),
    turnStartMs: integer(meta?.turnStartMs),
    promptID: asString(meta?.promptId),
    eventNumber: eventID === null ? null : parseEventNumber(eventID),
    kind: kindOf(type, update, meta),
  };
}
