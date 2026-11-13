// Assistant blocks and tool calls.

import { backgroundWorkItem, notice, question, toolActivity } from '../model/factories';
import { isSafeComponent } from '../model/paths';
import { capPreview } from '../model/preview';
import { applyWorkEnd, followAgent } from '../model/transcript';
import type { ChatBackgroundWorkItem, ChatToolActivity, ToolStatus } from '../model/types';
import type { Answer } from './answers';
import { answerOutcome } from './answers';
import { BuilderBase } from './builder-base';
import { workflowJournalPath } from './location';
import { dateOf, modelChangeTitle } from './prompts';
import type { ClaudeRecord, ClaudeToolUse, ClaudeToolUseResult } from './record-types';
import { noticeParts } from './text';
import {
  commandPurpose,
  outcomeNote,
  outcomeStatus,
  pendingDetail,
  pendingSummary,
  summarizeTool,
  toolExitCode,
  toolFileChanges,
  toolImagePath,
  toolPreview,
} from './tool-summary';
import { endOfDelivery } from './turns';

function nonEmpty(text: string | null | undefined): string | null {
  return text === null || text === undefined || text === '' ? null : text;
}

function _commandText(name: string, args: string): string {
  return args === '' ? `/${name}` : `/${name} ${args}`;
}

const NARRATION_THINKING_LIMIT = 200;

export abstract class ToolBuilder extends BuilderBase {
  // MARK: Assistant

  protected addAssistant(record: ClaudeRecord): void {
    record.blocks.forEach((block, position) => {
      // One block per record in 2.1.291; older releases wrote several.
      const suffix = position === 0 ? '' : `#${position}`;
      switch (block.type) {
        case 'text': {
          if (block.text.trim() === '') return;
          if (record.isAPIError) {
            const parts = noticeParts(block.text);
            this.add(`notice:${record.uuid}${suffix}`, record, {
              type: 'notice',
              value: notice('error', parts.title, { detail: parts.detail }),
            });
          } else {
            this.add(`text:${record.uuid}${suffix}`, record, {
              type: 'assistant',
              value: { text: block.text },
            });
          }
          return;
        }
        case 'thinking': {
          const duration = record.thinkingDurationMilliseconds;
          if (
            block.text.trim() !== '' &&
            (duration === null || duration < NARRATION_THINKING_LIMIT)
          ) {
            this.add(`text:${record.uuid}${suffix}`, record, {
              type: 'assistant',
              value: { text: block.text },
            });
          } else {
            this.add(`think:${record.uuid}${suffix}`, record, {
              type: 'reasoning',
              value: { text: block.text, durationMilliseconds: duration },
            });
          }
          return;
        }
        case 'redactedThinking':
          this.add(`think:${record.uuid}${suffix}`, record, {
            type: 'reasoning',
            value: { text: '', durationMilliseconds: record.thinkingDurationMilliseconds },
          });
          return;
        case 'toolUse':
          this.addToolUse(block.use, record);
          return;
        case 'fallback':
          this.add(`notice:${record.uuid}${suffix}`, record, {
            type: 'notice',
            value: notice('modelChange', modelChangeTitle(block.from, block.to)),
          });
          return;
        default:
          return;
      }
    });
  }

  protected addToolUse(use: ClaudeToolUse, record: ClaudeRecord): void {
    const callID = use.id === '' ? null : use.id;
    const entryID = `tool:${callID ?? record.uuid}`;
    const answer = callID === null ? undefined : this.answers.get(callID);
    const outcome = answer ? answerOutcome(answer) : null;
    const structured = answer?.record.toolResult?.result ?? null;
    let status: ToolStatus = outcome
      ? outcomeStatus(outcome)
      : this.unansweredStatus(use, record.byteOffset);
    if (
      status === 'succeeded' &&
      (structured?.status === 'async_launched' || structured?.status === 'remote_launched')
    ) {
      status = this.backgroundStatus(callID, record.byteOffset);
    } else if (status === 'succeeded' && structured?.status === 'teammate_spawned') {
      status = 'started';
    }

    let placed: boolean;
    if (use.name === 'ExitPlanMode') {
      const filePath =
        structured?.filePath ??
        (answer ? this.planExitPaths.get(answer.record.uuid) : undefined) ??
        use.input.planFilePath;
      // Claude Code 2.1.301 fills `input.plan` from the plan file as it stood before a Write in the
      // same message; until the result says which plan it was, the latest Write is the plan.
      const written =
        use.input.planFilePath === null ? undefined : this.planWrites.get(use.input.planFilePath);
      placed = this.add(entryID, record, {
        type: 'plan',
        value: {
          text: structured?.plan ?? written ?? use.input.plan ?? '',
          filePath: filePath ?? null,
          status,
          note: outcome ? outcomeNote(outcome) : null,
          callID,
          cardAnswer: null,
        },
      });
    } else if (use.name === 'Write' && use.input.planContent !== null) {
      if (use.input.filePath !== null && status !== 'failed' && status !== 'declined') {
        this.planWrites.set(use.input.filePath, use.input.planContent);
      }
      placed = this.add(entryID, record, {
        type: 'tool',
        value: this.toolRow(use, record, status, answer),
      });
    } else if (use.name === 'EnterPlanMode' && status === 'succeeded') {
      placed = this.add(entryID, record, {
        type: 'notice',
        value: notice('planMode', 'Entered plan mode'),
      });
    } else {
      placed = this.add(entryID, record, {
        type: 'tool',
        value: this.toolRow(use, record, status, answer),
      });
    }

    if (placed) {
      const item = this.backgroundItem(use, record, structured);
      if (item) this.backgroundWork.push(item);
    }
    if (!placed || answer || this.turnEnded(record.byteOffset)) return;
    this.pendingRequests.push({
      entryID,
      callID,
      kind: summarizeTool(use).kind,
      toolName: use.name,
      summary: pendingSummary(use),
      detail: pendingDetail(use),
      questions: use.input.questions,
      planFilePath: use.name === 'ExitPlanMode' ? use.input.planFilePath : null,
    });
  }

  protected toolRow(
    use: ClaudeToolUse,
    record: ClaudeRecord,
    status: ToolStatus,
    answer: Answer | undefined,
  ): ChatToolActivity {
    const summary = summarizeTool(use, record.cwd);
    const row = toolActivity({
      kind: summary.kind,
      name: use.name,
      title: summary.title,
      subtitle: summary.subtitle,
      ...commandPurpose(use),
      status,
      callID: use.id === '' ? null : use.id,
    });
    const structured = answer?.record.toolResult?.result ?? null;
    if (answer) {
      const outcome = answerOutcome(answer);
      const details = answer.record.toolResult;
      row.note = outcomeNote(outcome);
      row.preview = toolPreview(use, answer.result, details, outcome);
      row.output = {
        path: null,
        offset: answer.record.byteOffset,
        length: answer.record.byteLength,
      };
      row.exitCode = toolExitCode(use, answer.result);
      if (outcome.type === 'succeeded') row.diff = structured?.diff ?? null;
      row.fileChanges = toolFileChanges(use, details, outcome);
      row.imagePath = toolImagePath(use, details);
    }
    if (
      this.role === 'main' &&
      (use.name === 'Agent' || use.name === 'Task') &&
      structured?.status !== 'teammate_spawned' &&
      structured?.agentID != null &&
      isSafeComponent(structured.agentID)
    ) {
      row.subagentAgentID = structured.agentID;
    }
    if (isWorkflow(use, structured) && structured?.workflowName) {
      row.title = structured.workflowName;
      row.subtitle = structured.workflowSummary;
    }
    if (structured?.status === 'teammate_spawned') {
      const name = nonEmpty(use.input.teammateName ?? structured.teammateName);
      if (name) row.subtitle = `Teammate @${name}`;
    }
    // A background agent reports through its notification.
    const report = use.id === '' ? null : this.notifications.get(use.id)?.notification.result;
    if (row.preview === null && report) row.preview = capPreview(report);
    if (use.name === 'AskUserQuestion') {
      const given = structured?.answers ?? {};
      row.questions = use.input.questions.map((q) =>
        question({ ...q, answer: given[q.text] ?? null }),
      );
    }
    return row;
  }

  protected unansweredStatus(use: ClaudeToolUse, offset: number): ToolStatus {
    if (this.turnEnded(offset)) return 'noResult';
    switch (this.activity) {
      case 'blocked':
        return 'awaitingApproval';
      case 'idle':
        return use.name === 'AskUserQuestion' ? 'awaitingApproval' : 'noResult';
      default:
        return 'running';
    }
  }

  protected backgroundStatus(callID: string | null, offset: number): ToolStatus {
    const delivery = callID === null ? undefined : this.notifications.get(callID);
    if (delivery) {
      switch (delivery.notification.status) {
        case 'failed':
          return 'failed';
        case 'killed':
        case 'stopped':
          return 'interrupted';
        case 'blocked':
          return 'awaitingApproval';
        default:
          return 'succeeded';
      }
    }
    return this.agentsKilled.some((record) => record.byteOffset > offset)
      ? 'interrupted'
      : 'running';
  }

  protected backgroundItem(
    use: ClaudeToolUse,
    record: ClaudeRecord,
    result: ClaudeToolUseResult | null,
  ): ChatBackgroundWorkItem | null {
    if (this.role !== 'main' || use.id === '' || !result) return null;
    if (result.status !== 'async_launched' && result.status !== 'remote_launched') return null;
    let item: ChatBackgroundWorkItem;
    if (isWorkflow(use, result)) {
      item = backgroundWorkItem({
        id: use.id,
        kind: 'workflow',
        title: nonEmpty(result.workflowName) ?? 'Workflow',
        subtitle: nonEmpty(result.workflowSummary),
        launchOffset: record.byteOffset,
      });
      if (this.transcriptPath !== null && result.runID !== null) {
        item.journalPath = workflowJournalPath(this.transcriptPath, result.runID);
      }
    } else if (use.name === 'Agent' || use.name === 'Task') {
      item = backgroundWorkItem({
        id: use.id,
        kind: 'subagent',
        title: nonEmpty(use.input.description) ?? 'Subagent',
        subtitle: nonEmpty(use.input.subagentType),
        launchOffset: record.byteOffset,
        agentID: result.agentID && isSafeComponent(result.agentID) ? result.agentID : null,
      });
    } else {
      return null;
    }
    item.launchedAt = dateOf(record.timestamp);
    const delivery = this.notifications.get(use.id);
    const end = delivery ? endOfDelivery(delivery) : this.endStoppingAfter(record.byteOffset);
    if (end) item = applyWorkEnd(item, end);
    return item.agentID === null
      ? item
      : followAgent(item, this.backgroundWorkAgents[item.agentID]);
  }
}

function isWorkflow(use: ClaudeToolUse, result: ClaudeToolUseResult | null): boolean {
  return use.name === 'Workflow' || result?.taskType === 'local_workflow';
}
