// The Codex timeline before display rules (Swift CodexTimeline): turns, their entries and the
// state of synchronous question calls built from lines that may arrive separately.

import { question } from '../model/factories';
import type { ChatDivider, ChatQuestion } from '../model/types';
import type { CodexEchoCandidate } from './pending-echo';
import type { CodexItemContent, CodexSyncQuestion, CodexVerifiedAnswer } from './record';
import { displayAnswer } from './tool-summary';

export type CodexTurnStatus = 'inProgress' | 'completed' | 'failed' | 'interrupted';

export interface CodexQuestionState {
  callID: string;
  questions: ChatQuestion[];
  /** An output arrived without answers: Codex closed the question. */
  isClosed: boolean;
}

export function isAnswered(state: CodexQuestionState): boolean {
  return state.questions.some((q) => q.answer !== null);
}

/** What the lines say about one sync question call so far. */
export interface CodexQuestionBuild {
  questions: CodexSyncQuestion[];
  /** `verified_answer`: the answers Codex accepted, keyed by question text. */
  verified: CodexVerifiedAnswer['answers'] | null;
  /** The tool output's answers by question id. */
  outputAnswers: Record<string, string> | null;
  hasOutput: boolean;
}

export function emptyQuestionBuild(questions: CodexSyncQuestion[] = []): CodexQuestionBuild {
  return { questions, verified: null, outputAnswers: null, hasOutput: false };
}

function firstLineOf(text: string): string {
  const end = text.search(/\r?\n/);
  return end < 0 ? text : text.slice(0, end);
}

/**
 * The questions with their answers. A verified answer wins over the output's; its question text is
 * the call's, sometimes followed by the chosen option's description on later lines.
 */
export function questionState(build: CodexQuestionBuild, callID: string): CodexQuestionState {
  let questions = build.questions.map((q) => {
    const verified = build.verified?.find(
      (answer) => answer.question === q.text || answer.question.startsWith(`${q.text}\n`),
    );
    const fromOutput = q.id === null ? undefined : build.outputAnswers?.[q.id];
    const answer = verified?.answer ?? fromOutput;
    return question({
      id: q.id,
      header: q.header,
      text: firstLineOf(q.text),
      options: q.options,
      answer: answer === undefined ? null : displayAnswer(answer),
    });
  });
  if (questions.length === 0 && build.verified) {
    questions = build.verified.map((v) =>
      question({ text: firstLineOf(v.question), answer: displayAnswer(v.answer) }),
    );
  }
  const answered = questions.some((q) => q.answer !== null);
  return { callID, questions, isClosed: build.hasOutput && !answered };
}

export type CodexTimelineContent =
  | { type: 'item'; value: CodexItemContent }
  | { type: 'question'; value: CodexQuestionState }
  | { type: 'stopped'; reason: string; error: string | null }
  | { type: 'failed'; message: string | null }
  | { type: 'divider'; value: ChatDivider };

/** An entry before display rules: user messages, open calls and questions depend on context. */
export interface CodexTimelineEntry {
  id: string;
  sourceOffset: number;
  /** The Codex item id, which async question ids are built from. */
  itemID: string | null;
  /** The rollout whose line placed the entry. */
  rolloutID: string;
  /** The file that line is in, or null for the live rollout. */
  path: string | null;
  content: CodexTimelineContent;
}

export interface CodexTimelineTurn {
  id: string;
  /** Null when no loaded line says. */
  status: CodexTurnStatus | null;
  entries: CodexTimelineEntry[];
  /** The Stopped or failure row that ends the turn. */
  ending: CodexTimelineEntry | null;
  startedAt: string | null;
  endedAt: string | null;
  /** False when the turn started above the loaded lines. */
  opensInWindow: boolean;
}

export interface CodexTimeline {
  /** Rows above the first turn: a divider where older history is missing. */
  leading: CodexTimelineEntry[];
  turns: CodexTimelineTurn[];
}

export function emptyTimeline(): CodexTimeline {
  return { leading: [], turns: [] };
}

/** A turn as tests and diagnostics see it. */
export interface CodexTurnSummary {
  id: string;
  status: CodexTurnStatus | null;
  entryIDs: string[];
}

export type { CodexEchoCandidate };
