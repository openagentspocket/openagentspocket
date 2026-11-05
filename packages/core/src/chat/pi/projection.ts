// The Pi/OMP transcript projection (Swift PiTranscriptReducer.transcript). Pi/OMP v2-v3 JSONL is an
// append-only tree: replay the latest selected leaf's ancestry, including invisible
// extension/state entries. File order alone would resurrect messages abandoned by /tree or a
// branch switch.

import { divider, notice, userMessage } from '../model/factories';
import { markdownPlainText } from '../model/markdown-plain';
import { capPreview } from '../model/preview';
import { asObject, asString } from '../model/reducer';
import { type ChatProjectionContext, type ChatTranscript, emptyTranscript } from '../model/types';
import { PiBuilder } from './builder';
import type { PiRecord } from './record';
import { assistantRow } from './rows-assistant';
import { toolResultRow } from './rows-result';
import { userRow } from './rows-user';
import { skillCommand } from './skills';

/** Records the projection leaves alone: they only move the branch. */
const QUIET_TYPES: ReadonlySet<string> = new Set([
  'model_change',
  'thinking_level_change',
  'model_usage',
  'usage',
  'service_tier_change',
  'custom',
  'label',
  'context_edit',
  'session_init',
  'credential_pin',
  'ttsr_injection',
  'mode_change',
]);

/** The records on the selected branch, oldest first, and what the session records say about it. */
function selectBranch(records: readonly PiRecord[]) {
  const byID = new Map<string, PiRecord>();
  let leaf: string | null = null;
  let title: string | null = null;
  let directory: string | null = null;
  for (const record of records) {
    if (record.type === 'session' || record.type === 'title') {
      const name = asString(record.value.title);
      if (name !== null) title = name;
      const cwd = asString(record.value.cwd);
      if (cwd !== null) directory = cwd;
      continue;
    }
    if (record.id === null) continue;
    byID.set(record.id, record);
    // Late usage belongs to an earlier call and must not select that call's branch again.
    leaf =
      record.type === 'model_usage' && 'activeLeafId' in record.value
        ? asString(record.value.activeLeafId)
        : record.id;
  }
  const chain: PiRecord[] = [];
  const seen = new Set<string>();
  let missingAncestor = false;
  while (leaf !== null && !seen.has(leaf)) {
    seen.add(leaf);
    const record = byID.get(leaf);
    if (!record) {
      missingAncestor = true;
      break;
    }
    chain.push(record);
    leaf = record.parent;
  }
  chain.reverse();
  return { chain, title, directory, missingAncestor };
}

export function projectPiTranscript(
  records: readonly PiRecord[],
  context: ChatProjectionContext,
  flagsSteers: boolean,
  counts: { invalid: number; oversized: number },
): ChatTranscript {
  const ordered = [...records].sort((a, b) => a.offset - b.offset);
  const { chain, title, directory, missingAncestor } = selectBranch(ordered);
  const transcript = emptyTranscript();
  transcript.title = title;
  transcript.needsOlderHistory = context.windowStart > 0 || missingAncestor;
  transcript.diagnostics = {
    invalidLines: counts.invalid,
    oversizedLines: counts.oversized,
    unknownRecordTypes: new Set<string>(),
  };
  const unknownTypes = transcript.diagnostics.unknownRecordTypes as Set<string>;
  const b = new PiBuilder(transcript, context, directory, flagsSteers);
  const messageRow = (record: PiRecord, position: number) => {
    const message = asObject(record.value.message);
    const role = asString(message?.role);
    if (!message || role === null) return;
    switch (role) {
      case 'user':
        userRow(b, record, message);
        break;
      case 'assistant':
        assistantRow(b, record, message, position, chain);
        break;
      case 'toolResult':
        toolResultRow(b, record, message);
        break;
      case 'custom':
      case 'hookMessage':
        b.customNotice(record, message);
        break;
      case 'developer':
        break;
      case 'bashExecution':
        b.add(record, {
          type: 'notice',
          value: notice('shellCommand', asString(message.command) ?? 'Shell command', {
            detail: capPreview(asString(message.output) ?? '').text,
          }),
        });
        break;
      case 'pythonExecution':
        // Oh My Pi's `$ code`, recorded as `!` is.
        b.add(record, {
          type: 'notice',
          value: notice('pythonCommand', asString(message.code) ?? 'Python', {
            detail: capPreview(asString(message.output) ?? '').text,
          }),
        });
        break;
      default:
        unknownTypes.add(`message:${role}`);
    }
  };

  chain.forEach((record, position) => {
    switch (record.type) {
      case 'session_info':
      case 'title_change': {
        // Pi clears a session's name with an empty one.
        const name = asString(record.value.name) ?? asString(record.value.title);
        if (name !== null) transcript.title = name === '' ? null : name;
        break;
      }
      case 'compaction':
        // Pi writes its summaries in Markdown, which neither row draws: they preview as plain lines.
        b.add(record, {
          type: 'divider',
          value: divider('compaction', summaryText(asString(record.value.summary))),
        });
        break;
      case 'branch_summary': {
        // Oh My Pi's atomic rewrite records the entry it dropped as an empty summary.
        const summary = asString(record.value.summary);
        if (
          !summary ||
          asString(asObject(record.value.details)?.kind) === 'discarded-entry-branch'
        ) {
          break;
        }
        // Copy gives the summary as written.
        const plain = markdownPlainText(summary);
        b.add(record, {
          type: 'notice',
          value: notice('system', 'Branch summary', {
            detail: plain,
            rawDetail: plain === summary ? null : summary,
          }),
        });
        break;
      }
      case 'reset_boundary':
        b.add(record, { type: 'notice', value: notice('system', 'Conversation context cleared') });
        break;
      case 'custom_message': {
        // Oh My Pi records `/skill:name` as the expanded skill, with the prompt as submitted in its details.
        const prompt = asString(asObject(record.value.details)?.prompt);
        if (
          asString(record.value.customType) === 'skill-prompt' &&
          asString(record.value.attribution) !== 'agent' &&
          prompt !== null
        ) {
          const command = skillCommand(prompt);
          const message = command
            ? userMessage(
                command.arguments === ''
                  ? `/${command.name}`
                  : `/${command.name} ${command.arguments}`,
                { command },
              )
            : userMessage(prompt);
          b.openTurn(record, { type: 'user', value: message }, prompt);
          b.toolResultWrittenAt = null;
        } else {
          b.customNotice(record, record.value);
        }
        break;
      }
      case 'message':
        messageRow(record, position);
        break;
      default:
        if (!QUIET_TYPES.has(record.type)) unknownTypes.add(record.type);
    }
  });

  const latestTurnOffset = transcript.latestPromptOffset ?? context.windowStart;
  const ended = ['stop', 'length', 'aborted', 'error'].includes(b.lastStopReason ?? '');
  for (const entry of transcript.entries) {
    if (entry.content.type !== 'tool' || entry.content.value.output !== null) continue;
    const tool = entry.content.value;
    if (entry.sourceOffset < latestTurnOffset || ended) tool.status = 'interrupted';
    if (tool.status === 'awaitingApproval') {
      transcript.pendingRequests.push({
        entryID: entry.id,
        callID: tool.callID,
        kind: tool.kind,
        toolName: tool.name,
        summary: tool.title,
        detail: tool.subtitle,
        questions: tool.questions,
        planFilePath: null,
      });
    }
  }
  return transcript;
}

/** A compaction divider's preview: the summary as plain lines, capped like a row's output. */
function summaryText(summary: string | null): string | null {
  if (summary === null) return null;
  const preview = capPreview(markdownPlainText(summary)).text;
  return preview === '' ? null : preview;
}
