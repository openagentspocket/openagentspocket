// Applies the projection context to a timeline (Swift CodexTimelineProjector): open calls resolve
// against herdr's activity, replies fill the questions they answer, and skills read as commands.

import { isImagePlaceholder, replacingImagePlaceholders } from '../claude/prompts';
import { notice, question, toolActivity } from '../model/factories';
import type {
  ChatAgentActivity,
  ChatEntry,
  ChatEntryContent,
  ChatPendingRequest,
  ChatProjectionContext,
  ChatQuestion,
  ChatRecordedPrompt,
  ChatTurn,
  ChatTurnEnd,
  ToolStatus,
  TurnEnding,
} from '../model/types';
import { Answers } from './answers';
import { asyncQuestionID, displayUserContent } from './message-formatter';
import type { CodexEchoCandidate } from './pending-echo';
import {
  type CodexQuestionState,
  type CodexTimeline,
  type CodexTimelineEntry,
  type CodexTimelineTurn,
  type CodexTurnSummary,
  isAnswered,
} from './timeline';
import { displayAnswer, errorDisplay } from './tool-summary';

export interface ProjectionOutput {
  entries: ChatEntry[];
  pendingRequests: ChatPendingRequest[];
  recordedPrompts: ChatRecordedPrompt[];
  turns: CodexTurnSummary[];
  chatTurns: ChatTurn[];
  precedingTurnEnd: ChatTurnEnd | null;
  echoCandidates: CodexEchoCandidate[];
}

/**
 * What a call without a recorded outcome shows: the newest open turn follows herdr's activity;
 * any other open turn was cut off.
 */
function openStatus(
  turn: CodexTimelineTurn,
  isLive: boolean,
  activity: ChatAgentActivity,
): ToolStatus {
  switch (turn.status) {
    case 'interrupted':
      return 'interrupted';
    case 'completed':
    case 'failed':
      return 'noResult';
    default:
      if (!isLive) return turn.status === 'inProgress' ? 'interrupted' : 'noResult';
      if (activity === 'working') return 'running';
      if (activity === 'blocked') return 'awaitingApproval';
      return 'noResult';
  }
}

function endingOf(status: CodexTimelineTurn['status']): TurnEnding | null {
  return status === 'completed' || status === 'interrupted' || status === 'failed' ? status : null;
}

interface Scope {
  answers: Answers;
  context: ChatProjectionContext;
  liveRolloutID: string;
  output: ProjectionOutput;
}

export function projectTimeline(
  timeline: CodexTimeline,
  context: ChatProjectionContext,
  liveRolloutID: string,
): ProjectionOutput {
  const output: ProjectionOutput = {
    entries: [],
    pendingRequests: [],
    recordedPrompts: [],
    turns: [],
    chatTurns: [],
    precedingTurnEnd: null,
    echoCandidates: [],
  };
  const scope: Scope = { answers: new Answers(timeline), context, liveRolloutID, output };
  for (const entry of timeline.leading) {
    output.entries.push(projectEntry(entry, false, 'noResult', scope));
  }
  // Only the newest turn can still be running: Codex runs one turn at a time.
  const last = timeline.turns.length - 1;
  const lastStatus = timeline.turns[last]?.status ?? null;
  const liveTurn = last >= 0 && (lastStatus === null || lastStatus === 'inProgress') ? last : -1;
  timeline.turns.forEach((turn, index) => {
    const open = openStatus(turn, index === liveTurn, context.activity);
    const entryIDs: string[] = [];
    turn.entries.forEach((entry, position) => {
      const chatEntry = projectEntry(entry, position > 0, open, scope);
      output.entries.push(chatEntry);
      entryIDs.push(chatEntry.id);
    });
    if (turn.ending) {
      const chatEntry = projectEntry(turn.ending, false, open, scope);
      output.entries.push(chatEntry);
      entryIDs.push(chatEntry.id);
    }
    output.turns.push({ id: turn.id, status: turn.status, entryIDs });
    const ending = endingOf(turn.status);
    const first = entryIDs[0];
    if (index === 0 && !turn.opensInWindow) {
      // A turn the window opens inside: only its end is news.
      output.precedingTurnEnd = ending ? { ending, endedAt: turn.endedAt, duration: null } : null;
    } else if (first !== undefined) {
      output.chatTurns.push({
        firstEntryID: first,
        startedAt: turn.startedAt,
        endedAt: turn.endedAt,
        ending,
      });
    }
  });
  return output;
}

function projectEntry(
  entry: CodexTimelineEntry,
  wasQueued: boolean,
  open: ToolStatus,
  scope: Scope,
): ChatEntry {
  const content = projectContent(entry, wasQueued, open, scope);
  return { id: entry.id, sourceOffset: entry.sourceOffset, content };
}

function projectContent(
  entry: CodexTimelineEntry,
  wasQueued: boolean,
  open: ToolStatus,
  scope: Scope,
): ChatEntryContent {
  const { output } = scope;
  const isLive = entry.rolloutID === scope.liveRolloutID;
  const body = entry.content;
  switch (body.type) {
    case 'item':
      return projectItem(entry, body.value, wasQueued, open, scope, isLive);
    case 'question':
      return projectQuestion(entry, body.value, open, output);
    case 'stopped':
      return {
        type: 'notice',
        value: notice(
          'stopped',
          body.reason === 'budget_limited' ? 'Stopped (budget)' : 'Stopped',
          {
            detail: body.error,
          },
        ),
      };
    case 'failed': {
      const display = body.message === null ? null : errorDisplay(body.message);
      return {
        type: 'notice',
        value: notice('error', 'Turn failed', {
          detail: display,
          rawDetail: display === body.message ? null : body.message,
        }),
      };
    }
    case 'divider':
      return { type: 'divider', value: body.value };
  }
}

function projectQuestion(
  entry: CodexTimelineEntry,
  state: CodexQuestionState,
  open: ToolStatus,
  output: ProjectionOutput,
): ChatEntryContent {
  let status = open;
  let note: string | null = null;
  if (isAnswered(state)) {
    status = 'succeeded';
  } else if (state.isClosed) {
    status = 'notCompleted';
    note = 'Question closed';
  }
  const title = state.questions[0]?.text ?? 'Question';
  if (status === 'running' || status === 'awaitingApproval') {
    output.pendingRequests.push({
      entryID: entry.id,
      callID: state.callID,
      kind: 'question',
      toolName: 'request_user_input',
      summary: title,
      detail: null,
      questions: state.questions,
      planFilePath: null,
    });
  }
  return {
    type: 'tool',
    value: toolActivity({
      kind: 'question',
      name: 'request_user_input',
      title,
      status,
      note,
      questions: state.questions,
      callID: state.callID,
    }),
  };
}

function projectItem(
  entry: CodexTimelineEntry,
  item: Extract<CodexTimelineEntry['content'], { type: 'item' }>['value'],
  wasQueued: boolean,
  open: ToolStatus,
  scope: Scope,
  isLive: boolean,
): ChatEntryContent {
  const { output, context } = scope;
  switch (item.type) {
    case 'user': {
      const user = item.value;
      const display = displayUserContent(user, context.skillNames, wasQueued);
      if (display.type === 'reply') {
        return {
          type: 'notice',
          value: notice('answered', 'Answered', {
            questions: display.replies.map((r) =>
              question({ id: r.questionItemID, text: r.question, answer: displayAnswer(r.answer) }),
            ),
          }),
        };
      }
      if (isLive) {
        // A pasted image path is recorded as `[Image #1]` plus the image; compare the path sent.
        const text = replacingImagePlaceholders(user.text, user.localImagePaths);
        output.recordedPrompts.push({
          offset: entry.sourceOffset,
          text,
          entryID: entry.id,
          pastedImagePaths: isImagePlaceholder(user.text) ? user.localImagePaths : null,
        });
        output.echoCandidates.push({
          rolloutID: entry.rolloutID,
          offset: entry.sourceOffset,
          entryID: entry.id,
          kind: { type: 'prompt', text: user.text, localImagePaths: user.localImagePaths },
        });
      }
      return { type: 'user', value: display.message };
    }
    case 'agent':
      return projectAgent(entry, item.value, open, scope);
    case 'reasoning':
      return {
        type: 'reasoning',
        value: { text: item.text, durationMilliseconds: item.durationMilliseconds },
      };
    case 'plan':
      return {
        type: 'plan',
        value: {
          text: item.text,
          filePath: null,
          status: 'succeeded',
          note: null,
          callID: null,
          cardAnswer: null,
        },
      };
    case 'compaction':
      if (isLive) {
        output.echoCandidates.push({
          rolloutID: entry.rolloutID,
          offset: entry.sourceOffset,
          entryID: entry.id,
          kind: { type: 'compaction' },
        });
      }
      return { type: 'divider', value: { kind: 'compaction', detail: null } };
    case 'hook':
      return {
        type: 'notice',
        value: notice('hook', 'Hook', { detail: item.text === '' ? null : item.text }),
      };
    case 'review':
      return { type: 'notice', value: notice('review', item.title, { detail: item.detail }) };
    case 'tool': {
      const row = item.value;
      const status = row.status ?? open;
      const reference =
        row.output && entry.path !== null ? { ...row.output, path: entry.path } : row.output;
      if (status === 'running' || status === 'awaitingApproval') {
        output.pendingRequests.push({
          entryID: entry.id,
          callID: row.callID,
          kind: row.kind,
          toolName: row.name,
          summary: row.title,
          detail: row.subtitle,
          questions: [],
          planFilePath: null,
        });
      }
      return {
        type: 'tool',
        value: toolActivity({
          kind: row.kind,
          name: row.name,
          title: row.title,
          subtitle: row.subtitle,
          status,
          note: row.note,
          diff: row.diff,
          exitCode: row.exitCode,
          callID: row.callID,
          preview: row.preview,
          output: reference,
          subagentActivity: row.subagentActivity,
          imagePath: row.imagePath,
        }),
      };
    }
  }
}

function projectAgent(
  entry: CodexTimelineEntry,
  agent: { text: string; questions: { title: string; options: string[] }[] },
  open: ToolStatus,
  scope: Scope,
): ChatEntryContent {
  if (agent.questions.length === 0) return { type: 'assistant', value: { text: agent.text } };
  const unanswered: ChatQuestion[] = [];
  const questions = agent.questions.map((asked, index) => {
    const id = entry.itemID === null ? null : asyncQuestionID(entry.itemID, index);
    const reply = scope.answers.reply(id, entry.itemID, asked.title);
    const chatQuestion = question({
      id,
      text: asked.title,
      options: asked.options.map((label) => ({ label, detail: null })),
      answer: reply?.answer ?? null,
    });
    if (reply === null) unanswered.push(chatQuestion);
    return chatQuestion;
  });
  // A set without an id cannot be answered from Chat, so it never feeds the question card. Codex
  // drops a turn's open questions when the turn ends, so only a running turn's can be on screen.
  const first = unanswered[0];
  if ((open === 'running' || open === 'awaitingApproval') && entry.itemID !== null && first) {
    scope.output.pendingRequests.push({
      entryID: entry.id,
      callID: entry.itemID,
      kind: 'question',
      toolName: 'request_user_input_async',
      summary: first.text,
      detail: null,
      questions: unanswered,
      planFilePath: null,
    });
  }
  return { type: 'questions', value: { questions } };
}
