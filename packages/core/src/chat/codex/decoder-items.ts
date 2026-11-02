// Turn items (`item_completed` events) reduced to what Chat renders (Swift CodexRecordDecoder,
// "Turn items").

import { type ChatLine, isTruncatedLine } from '../model/lines';
import type { ToolStatus } from '../model/types';
import {
  chatStatus,
  type DecodeContext,
  fileURLPath,
  firstLine,
  isAbortedPatch,
  joinedOutput,
  mcpName,
  reference,
  remoteImagePath,
  sleepTitle,
  userContentOf,
} from './decoder-common';
import type { RawAsyncQuestion, RawEvent, RawItem } from './raw';
import {
  type CodexAgentContent,
  type CodexItemContent,
  type CodexToolSnapshot,
  snapshot,
} from './record';
import * as summary from './tool-summary';

export const KNOWN_ITEM_TYPES: ReadonlySet<string> = new Set([
  'UserMessage',
  'AgentMessage',
  'Reasoning',
  'Plan',
  'ContextCompaction',
  'HookPrompt',
  'CommandExecution',
  'FileChange',
  'McpToolCall',
  'WebSearch',
  'Extension',
  'DynamicToolCall',
  'FunctionCallOutput',
  'ImageView',
  'ImageGeneration',
  'CollabAgentToolCall',
  'SubAgentActivity',
  'EnteredReviewMode',
  'ExitedReviewMode',
]);

/** Item types a legacy rollout's `item_completed` contributes. */
export const LEGACY_ITEM_TYPES: ReadonlySet<string> = new Set([
  'Plan',
  'HookPrompt',
  'FunctionCallOutput',
  'CommandExecution',
  'DynamicToolCall',
  'CollabAgentToolCall',
  'SubAgentActivity',
  'Extension',
  'EnteredReviewMode',
  'ExitedReviewMode',
]);

/** Items whose content is the message itself: a truncated line of these is skipped. */
const MESSAGE_ITEM_TYPES: ReadonlySet<string> = new Set([
  'UserMessage',
  'AgentMessage',
  'Reasoning',
  'Plan',
  'HookPrompt',
]);

export function isMessageItem(type: string): boolean {
  return MESSAGE_ITEM_TYPES.has(type);
}

export function agentContent(
  text: string,
  phase: string | null,
  delivery: string | null,
  questions: RawAsyncQuestion[] | null,
): CodexAgentContent {
  const content: CodexAgentContent = { text, phase, questions: [] };
  if (delivery?.toLowerCase() === 'async') {
    for (const question of questions ?? []) {
      if (question.title !== null) {
        content.questions.push({ title: question.title, options: question.options ?? [] });
      }
    }
  }
  return content;
}

export function imageGeneration(
  id: string,
  status: string | null,
  revisedPrompt: string | null,
  savedPath: string | null,
  line: ChatLine,
  context: DecodeContext,
): CodexToolSnapshot {
  let state: ToolStatus | null;
  if (status === 'failed') state = 'failed';
  else if (status === 'in_progress' || status === 'generating' || status === 'inProgress') {
    state = null;
  } else state = 'succeeded';
  return snapshot({
    kind: 'image',
    name: 'image_generation',
    title: (revisedPrompt ? firstLine(revisedPrompt) : null) ?? 'Image generation',
    subtitle: savedPath === null ? null : summary.relativePath(savedPath, context.cwd),
    status: state,
    callID: id,
    output: reference(line),
    imagePath: remoteImagePath(savedPath, context.cwd),
  });
}

export function subAgentActivity(path: string | null, kind: string | null): CodexToolSnapshot {
  const status: ToolStatus =
    kind === 'completed' ? 'succeeded' : kind === 'interrupted' ? 'interrupted' : 'noResult';
  const name =
    path
      ?.split('/')
      .filter((p) => p !== '')
      .pop() ?? null;
  return snapshot({
    kind: 'agent',
    name: 'SubAgentActivity',
    title: name === null ? 'Subagent' : `Subagent: ${name}`,
    status,
    subagentActivity: { agentPath: path, events: [kind ?? 'unknown'] },
  });
}

export interface ItemContentResult {
  content: CodexItemContent | null;
  unknownType: string | null;
}

const NONE: ItemContentResult = { content: null, unknownType: null };

function tool(value: CodexToolSnapshot): ItemContentResult {
  return { content: { type: 'tool', value }, unknownType: null };
}

function content(value: CodexItemContent): ItemContentResult {
  return { content: value, unknownType: null };
}

function isBlank(text: string): boolean {
  return text.trim() === '';
}

export function itemContent(
  type: string,
  raw: RawItem,
  event: RawEvent,
  line: ChatLine,
  context: DecodeContext,
): ItemContentResult {
  const complete = !isTruncatedLine(line);
  const ref = reference(line);
  switch (type) {
    case 'UserMessage':
      return content({ type: 'user', value: userContentOf(raw.content ?? []) });
    case 'AgentMessage': {
      const text = (raw.content ?? [])
        .map((p) => p.text)
        .filter((t): t is string => t !== null)
        .join('');
      const agent = agentContent(text, raw.phase, raw.delivery, raw.questions);
      return isBlank(agent.text) && agent.questions.length === 0
        ? NONE
        : content({ type: 'agent', value: agent });
    }
    case 'Reasoning': {
      const text = (raw.summaryText ?? []).filter((t) => t !== '').join('\n\n');
      if (isBlank(text)) return NONE;
      const { startedAtMilliseconds: start, completedAtMilliseconds: end } = event;
      const duration = start !== null && end !== null && end >= start ? end - start : null;
      return content({ type: 'reasoning', text, durationMilliseconds: duration });
    }
    case 'Plan':
      return raw.text === null || isBlank(raw.text)
        ? NONE
        : content({ type: 'plan', text: raw.text });
    case 'ContextCompaction':
      return content({ type: 'compaction' });
    case 'HookPrompt':
      return content({
        type: 'hook',
        text: (raw.fragments ?? []).filter((t) => t !== '').join('\n\n'),
      });
    case 'CommandExecution': {
      const argv = raw.command ?? [];
      const { kind, subtitle } = summary.commandKind(raw.parsedCommands ?? []);
      let status = chatStatus(raw.status);
      if (status === 'succeeded' && raw.exitCode !== null && raw.exitCode !== 0) status = 'failed';
      return tool(
        snapshot({
          kind,
          name: raw.source === 'user_shell' ? 'user_shell' : 'CommandExecution',
          title:
            argv.length === 0 || (!complete && raw.cwd === null)
              ? 'Command'
              : summary.commandTitle(argv),
          subtitle,
          status,
          exitCode: raw.exitCode,
          callID: raw.id,
          preview: complete ? summary.preview(raw.aggregatedOutput) : null,
          output: ref,
        }),
      );
    }
    case 'FileChange': {
      // A prefix drops the diff it cut, so its counts would be short.
      const changes = summary.fileChangeSummary(raw.changes ?? {}, context.cwd);
      let status = chatStatus(raw.status);
      let output = complete ? joinedOutput(raw.stdout, raw.stderr) : null;
      let diff = complete ? changes.diff : null;
      if (status === 'failed' && isAbortedPatch(output)) {
        status = 'interrupted';
        output = null;
        diff = null;
      }
      return tool(
        snapshot({
          kind: changes.kind,
          name: 'FileChange',
          title: changes.title === '' ? 'Patch' : changes.title,
          status,
          diff,
          callID: raw.id,
          preview: summary.preview(output),
          output: ref,
        }),
      );
    }
    case 'McpToolCall': {
      let status = chatStatus(raw.status);
      if (status === 'succeeded' && raw.result?.isError === true) status = 'failed';
      const name = mcpName(raw.server, raw.tool);
      return tool(
        snapshot({
          kind: 'mcp',
          name,
          title: name,
          status,
          callID: raw.id,
          preview: complete ? summary.mcpPreview(raw.result, raw.errorMessage) : null,
          output: ref,
        }),
      );
    }
    case 'WebSearch':
      return tool(
        snapshot({
          kind: 'web',
          name: 'WebSearch',
          title: summary.webSearchTitle(raw.query, raw.action),
          status: 'succeeded',
          callID: raw.id,
          output: ref,
        }),
      );
    case 'Extension':
      return extensionItem(raw, line, context);
    case 'DynamicToolCall': {
      const name =
        raw.namespace === null ? (raw.tool ?? 'tool') : `${raw.namespace}.${raw.tool ?? ''}`;
      const text = (raw.contentItems ?? [])
        .map((p) => p.text)
        .filter((t): t is string => t !== null)
        .join('\n');
      let status = chatStatus(raw.status);
      if (status === null && raw.success !== null) status = raw.success ? 'succeeded' : 'failed';
      return tool(
        snapshot({
          kind: 'other',
          name,
          title: name,
          status,
          callID: raw.id,
          preview: complete ? summary.preview(raw.errorMessage ?? text) : null,
          output: ref,
        }),
      );
    }
    case 'FunctionCallOutput': {
      const name =
        raw.namespace === null ? (raw.name ?? 'tool') : `${raw.namespace}.${raw.name ?? ''}`;
      return tool(
        snapshot({
          kind: 'other',
          name,
          title: name,
          status: 'succeeded',
          callID: raw.id,
          preview: complete
            ? summary.preview(raw.output?.text ?? null, raw.output?.imageCount ?? 0)
            : null,
          output: ref,
        }),
      );
    }
    case 'ImageView':
      return tool(
        snapshot({
          kind: 'image',
          name: 'ImageView',
          title:
            raw.path === null ? 'Image' : summary.relativePath(fileURLPath(raw.path), context.cwd),
          status: 'succeeded',
          callID: raw.id,
          output: ref,
          imagePath: remoteImagePath(raw.path, context.cwd),
        }),
      );
    case 'ImageGeneration':
      return tool(
        imageGeneration(raw.id ?? '', raw.status, raw.revisedPrompt, raw.savedPath, line, context),
      );
    case 'CollabAgentToolCall': {
      const name = raw.tool ?? 'agent';
      // A wait is plumbing: the subagent cards carry the state.
      if (name === 'wait') {
        return tool(
          snapshot({
            kind: 'other',
            name,
            title: 'Waited for subagents',
            status: chatStatus(raw.status),
            callID: raw.id,
            output: ref,
          }),
        );
      }
      const prompt = raw.prompt === null ? null : firstLine(raw.prompt);
      return tool(
        snapshot({
          kind: 'agent',
          name,
          title: prompt ?? name.split('_').join(' '),
          subtitle: prompt === null ? null : name,
          status: chatStatus(raw.status),
          callID: raw.id,
          output: ref,
        }),
      );
    }
    case 'SubAgentActivity':
      return tool(subAgentActivity(raw.agentPath, raw.kind));
    case 'EnteredReviewMode':
      return content({
        type: 'review',
        title: 'Review started',
        detail: raw.userFacingHint ?? 'Review requested.',
      });
    case 'ExitedReviewMode':
      return content({ type: 'review', title: 'Review finished', detail: raw.reviewExplanation });
    default:
      return { content: null, unknownType: `item_completed/${type}` };
  }
}

function extensionItem(raw: RawItem, line: ChatLine, context: DecodeContext): ItemContentResult {
  const ref = reference(line);
  switch (raw.kind) {
    case 'image_gen.generation':
      return tool(
        imageGeneration(raw.id ?? '', raw.status, raw.revisedPrompt, raw.savedPath, line, context),
      );
    case 'clock.sleep':
      return tool(
        snapshot({
          kind: 'other',
          name: 'clock.sleep',
          title: sleepTitle(raw.durationMilliseconds),
          status: 'succeeded',
          callID: raw.id,
          output: ref,
        }),
      );
    case 'web.search':
      return tool(
        snapshot({
          kind: 'web',
          name: 'web.search',
          title: summary.webSearchTitle(raw.query, raw.action),
          status: 'succeeded',
          callID: raw.id,
          output: ref,
        }),
      );
    default:
      return { content: null, unknownType: `item_completed/Extension/${raw.kind ?? ''}` };
  }
}
