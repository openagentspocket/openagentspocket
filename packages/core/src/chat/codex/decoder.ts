// Turns one classified line into a record (Swift CodexRecordDecoder). Decoding is the expensive
// step, so it runs only for lines that can show something; everything else is shape-checked and
// skipped. A truncated line is decoded from its repaired prefix when the fields that matter come
// first, and skipped as oversized when the content is the message itself.

import { type ChatLine, isTruncatedLine } from '../model/lines';
import type { CodexLineClassification } from './classifier';
import {
  chatStatus,
  type DecodeContext,
  envelope,
  isAbortedPatch,
  joinedOutput,
  mcpName,
  reference,
  shapeChecked,
} from './decoder-common';
import {
  agentContent,
  imageGeneration,
  isMessageItem,
  itemContent,
  KNOWN_ITEM_TYPES,
  LEGACY_ITEM_TYPES,
  subAgentActivity,
} from './decoder-items';
import { decodeResponse, decodeRetained } from './decoder-response';
import { isContextualLegacyMessage } from './message-formatter';
import { type RawEvent, readEvent } from './raw';
import {
  ACCEPTED,
  type CodexItem,
  type CodexLegacyPlacement,
  type CodexLineOutcome,
  type CodexRecord,
  type CodexTurnTimes,
  INVALID,
  OVERSIZED,
  snapshot,
  unknownOutcome,
  userContent,
  withRecord,
} from './record';
import * as summary from './tool-summary';

export { type DecodeContext, decodeContext, OUTPUT_DECODE_LIMIT } from './decoder-common';
export { CANCELLED_QUESTION_OUTPUT } from './decoder-response';

/** Event types some Codex version persists. Others are skipped without spending an ordinal. */
const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set([
  'task_started',
  'turn_started',
  'task_complete',
  'turn_complete',
  'turn_aborted',
  'token_count',
  'thread_settings_applied',
  'thread_goal_updated',
  'thread_rolled_back',
  'user_message',
  'agent_message',
  'agent_reasoning',
  'agent_reasoning_raw_content',
  'context_compacted',
  'patch_apply_end',
  'mcp_tool_call_end',
  'web_search_end',
  'image_generation_end',
  'sub_agent_activity',
  'entered_review_mode',
  'exited_review_mode',
]);

export function decodeLine(
  line: ChatLine,
  classification: CodexLineClassification,
  context: DecodeContext,
): CodexLineOutcome {
  const kind = classification.kind;
  switch (kind.type) {
    case 'sessionMeta':
    case 'ignorable':
      return shapeChecked(line);
    case 'compacted': {
      const outcome = shapeChecked(line);
      if (!outcome.isAccepted || context.dialect !== 'legacy') return outcome;
      return withRecord({ type: 'compacted' });
    }
    case 'unknown':
      return unknownOutcome(kind.value);
    case 'unclassified':
      return INVALID;
    case 'event':
      return decodeEvent(kind.value, line, context);
    case 'item':
      return decodeItem(kind.value, line, context);
    case 'response':
      return decodeResponse(kind.value, line, classification, context);
    case 'retainedContext':
      return decodeRetained(kind.value, line);
  }
}

// MARK: Events

function decodeEvent(type: string, line: ChatLine, context: DecodeContext): CodexLineOutcome {
  if (!KNOWN_EVENT_TYPES.has(type)) return unknownOutcome(`event_msg/${type}`);
  const legacy = context.dialect === 'legacy';
  switch (type) {
    case 'task_started':
    case 'turn_started':
    case 'task_complete':
    case 'turn_complete':
    case 'turn_aborted':
      break;
    case 'user_message':
    case 'agent_message':
    case 'agent_reasoning':
      if (!legacy) return shapeChecked(line);
      if (isTruncatedLine(line)) return OVERSIZED;
      break;
    case 'context_compacted':
    case 'thread_rolled_back':
    case 'patch_apply_end':
    case 'mcp_tool_call_end':
    case 'web_search_end':
    case 'image_generation_end':
    case 'sub_agent_activity':
    case 'entered_review_mode':
    case 'exited_review_mode':
      if (!legacy) return shapeChecked(line);
      break;
    default:
      return shapeChecked(line);
  }
  const payload = envelope(line)?.payload;
  if (!payload) return isTruncatedLine(line) ? OVERSIZED : INVALID;
  const result = eventRecord(type, readEvent(payload), line, context);
  if (result === 'malformed') return isTruncatedLine(line) ? OVERSIZED : INVALID;
  return result === 'nothing' ? ACCEPTED : withRecord(result);
}

function isoSeconds(seconds: number | null): string | null {
  return seconds !== null && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

function turnTimes(event: RawEvent): CodexTurnTimes {
  return {
    startedAt: isoSeconds(event.turnStartedAt),
    completedAt: isoSeconds(event.turnCompletedAt),
  };
}

function nonEmpty(value: string | null): string | null {
  return value ? value : null;
}

function legacyTool(id: string, row: ReturnType<typeof snapshot>, placement: CodexLegacyPlacement) {
  const item: CodexItem = { id, content: { type: 'tool', value: row } };
  return { type: 'legacyItem', item, placement } as const;
}

/** The record an event makes, 'nothing' for a valid event with no content, 'malformed' if invalid. */
function eventRecord(
  type: string,
  event: RawEvent,
  line: ChatLine,
  context: DecodeContext,
): CodexRecord | 'nothing' | 'malformed' {
  const ref = reference(line);
  switch (type) {
    case 'task_started':
    case 'turn_started': {
      if (event.turnID === null) return 'malformed';
      const root = event.rootTurnID;
      return {
        type: 'turnStarted',
        turnID: event.turnID,
        rootTurnID: root && root !== event.turnID ? root : null,
        times: turnTimes(event),
      };
    }
    case 'task_complete':
    case 'turn_complete':
      return event.turnID === null
        ? 'malformed'
        : {
            type: 'turnCompleted',
            turnID: event.turnID,
            error: event.errorMessage,
            times: turnTimes(event),
          };
    case 'turn_aborted':
      return {
        type: 'turnAborted',
        turnID: event.turnID,
        reason: event.reason ?? 'interrupted',
        error: event.errorMessage,
        times: turnTimes(event),
      };
    case 'user_message': {
      const text = event.message ?? '';
      if (isContextualLegacyMessage(text, event.kind)) return 'nothing';
      return {
        type: 'userMessage',
        content: userContent(text, {
          imageCount: event.imageCount + event.localImages.length,
          localImagePaths: event.localImages,
          attachmentLabels: Array.from({ length: event.audioCount }, () => 'Audio'),
        }),
      };
    }
    case 'agent_message':
      return {
        type: 'agentMessage',
        content: agentContent(event.message ?? '', event.phase, event.delivery, event.questions),
      };
    case 'agent_reasoning':
      return { type: 'reasoning', text: event.text ?? '' };
    case 'context_compacted':
      return { type: 'contextCompacted' };
    case 'thread_rolled_back':
      return event.numTurns === null
        ? 'malformed'
        : { type: 'rolledBack', turns: Math.max(0, event.numTurns) };
    case 'patch_apply_end': {
      if (event.callID === null) return 'malformed';
      const changes = summary.fileChangeSummary(event.changes ?? {}, context.cwd);
      let status = chatStatus(event.status) ?? (event.success === false ? 'failed' : 'succeeded');
      let output = joinedOutput(event.stdout, event.stderr);
      let diff: typeof changes.diff | null = changes.diff;
      if (status === 'failed' && isAbortedPatch(output)) {
        status = 'interrupted';
        output = null;
        diff = null;
      }
      const row = snapshot({
        kind: changes.kind,
        name: 'apply_patch',
        title: changes.title === '' ? 'Patch' : changes.title,
        status,
        diff,
        callID: event.callID,
        preview: summary.preview(output),
        output: ref,
      });
      return legacyTool(event.callID, row, {
        type: 'turnOrCurrent',
        turnID: nonEmpty(event.turnID),
      });
    }
    case 'mcp_tool_call_end': {
      if (event.callID === null) return 'malformed';
      const failed = event.mcpResult?.ok == null || event.mcpResult.ok.isError === true;
      const name = mcpName(event.server, event.tool);
      const row = snapshot({
        kind: 'mcp',
        name,
        title: name,
        status: failed ? 'failed' : 'succeeded',
        callID: event.callID,
        preview: summary.mcpPreview(event.mcpResult?.ok ?? null, event.mcpResult?.error ?? null),
        output: ref,
      });
      return legacyTool(event.callID, row, {
        type: 'turnOrCurrent',
        turnID: nonEmpty(event.turnID),
      });
    }
    case 'web_search_end': {
      if (event.callID === null) return 'malformed';
      const row = snapshot({
        kind: 'web',
        name: 'web_search',
        title: summary.webSearchTitle(event.query, event.action),
        status: 'succeeded',
        callID: event.callID,
        output: ref,
      });
      return legacyTool(event.callID, row, { type: 'current' });
    }
    case 'image_generation_end': {
      if (event.callID === null) return 'malformed';
      const row = imageGeneration(
        event.callID,
        event.status,
        event.revisedPrompt,
        event.savedPath,
        line,
        context,
      );
      return legacyTool(event.callID, row, { type: 'current' });
    }
    case 'sub_agent_activity': {
      if (event.eventID === null) return 'malformed';
      return legacyTool(event.eventID, subAgentActivity(event.agentPath, event.kind), {
        type: 'current',
      });
    }
    case 'entered_review_mode':
    case 'exited_review_mode': {
      const entered = type === 'entered_review_mode';
      const id = event.itemID ?? `review@${line.offset}`;
      return {
        type: 'legacyItem',
        item: {
          id,
          content: {
            type: 'review',
            title: entered ? 'Review started' : 'Review finished',
            detail: entered
              ? (event.userFacingHint ?? 'Review requested.')
              : event.reviewExplanation,
          },
        },
        placement: { type: 'review', turnID: event.turnID },
      };
    }
    default:
      return 'nothing';
  }
}

// MARK: Turn items

function decodeItem(type: string, line: ChatLine, context: DecodeContext): CodexLineOutcome {
  if (!KNOWN_ITEM_TYPES.has(type)) return unknownOutcome(`item_completed/${type}`);
  if (context.dialect === 'legacy' && !LEGACY_ITEM_TYPES.has(type)) return shapeChecked(line);
  if (isTruncatedLine(line) && isMessageItem(type)) return OVERSIZED;
  // The ids precede everything large, so a prefix without them is too short to place anything.
  const payload = envelope(line)?.payload;
  const event = payload ? readEvent(payload) : null;
  const raw = event?.item ?? null;
  if (!event || !raw || event.turnID === null || raw.id === null) {
    return isTruncatedLine(line) ? OVERSIZED : INVALID;
  }
  const result = itemContent(type, raw, event, line, context);
  if (result.content === null) return { ...ACCEPTED, unknownType: result.unknownType };
  const item: CodexItem = { id: raw.id, content: result.content };
  if (context.dialect === 'legacy') {
    const review = type === 'EnteredReviewMode' || type === 'ExitedReviewMode';
    const placement: CodexLegacyPlacement = review
      ? { type: 'review', turnID: event.turnID }
      : { type: 'turn', turnID: event.turnID };
    return {
      ...ACCEPTED,
      unknownType: result.unknownType,
      record: { type: 'legacyItem', item, placement },
    };
  }
  return {
    ...ACCEPTED,
    unknownType: result.unknownType,
    record: { type: 'item', turnID: event.turnID, item },
  };
}
