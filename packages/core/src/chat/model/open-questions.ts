// The questions a conversation shows waiting for the user, whatever herdr reports. herdr 0.9.5 can
// report an Agent idle over a question, and most programs read an unanswered call by that activity,
// so an open question is what the same records say once projected Blocked (Swift reads Claude's
// alone, by `readsIdleQuestion`).

import type {
  ChatAgentActivity,
  ChatEntry,
  ChatPendingRequest,
  ChatQuestion,
  ChatTranscript,
  ToolStatus,
} from './types';

const unanswered = (questions: readonly ChatQuestion[]): boolean =>
  questions.some((question) => question.answer === null && question.queuedAnswer === null);

/** Whether an entry can still be waiting: cheap, so a conversation that asks nothing projects once. */
function mayWait({ content }: ChatEntry): boolean {
  if (content.type === 'questions') return unanswered(content.value.questions);
  return content.type === 'tool' && content.value.kind === 'question'
    ? content.value.questions.length === 0 || unanswered(content.value.questions)
    : false;
}

/** The calls that wait on the user's answer. `project` projects the same records for an activity. */
export function openQuestions(
  transcript: ChatTranscript,
  project: (activity: ChatAgentActivity) => ChatTranscript,
): ChatPendingRequest[] {
  if (!transcript.entries.some(mayWait)) return [];
  return project('blocked').pendingRequests.filter((request) => request.kind === 'question');
}

/** What a Blocked card learns from the conversation (`BlockedCardStore.setCalls`). */
export interface TranscriptCalls {
  /** Calls waiting for an answer. */
  readonly waiting: ReadonlySet<string>;
  /** Calls whose outcome the transcript shows. */
  readonly resolved: ReadonlySet<string>;
  readonly openQuestion: boolean;
  /** The waiting calls, oldest first, that a dialog on screen is matched against. */
  readonly requests: readonly ChatPendingRequest[];
  /** A subagent call is running, whose own requests the screen may show. */
  readonly subagentRunning: boolean;
}

const isOpen = (status: ToolStatus): boolean =>
  status === 'running' || status === 'awaitingApproval';

export function transcriptCalls(
  transcript: ChatTranscript,
  questions: readonly ChatPendingRequest[],
): TranscriptCalls {
  const waiting = new Set<string>();
  const requests = [...transcript.pendingRequests, ...questions];
  for (const request of requests) {
    if (request.callID !== null) waiting.add(request.callID);
  }
  const resolved = new Set<string>();
  let subagentRunning = false;
  for (const { content } of transcript.entries) {
    if (content.type === 'tool' && content.value.kind === 'agent' && isOpen(content.value.status)) {
      subagentRunning = true;
    }
    const call =
      content.type === 'tool' || content.type === 'plan'
        ? { id: content.value.callID, status: content.value.status }
        : null;
    if (call?.id && !isOpen(call.status) && !waiting.has(call.id)) resolved.add(call.id);
  }
  return { waiting, resolved, openQuestion: questions.length > 0, requests, subagentRunning };
}
