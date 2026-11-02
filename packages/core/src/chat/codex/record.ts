// What one rollout line contributes to the transcript (Swift CodexRolloutRecord, records part).

import type {
  ChatDiffStats,
  ChatOutputReference,
  ChatQuestionOption,
  ChatSubagentActivity,
  ChatToolPreview,
  ToolKind,
  ToolStatus,
} from '../model/types';

export interface CodexUserContent {
  /** The text parts joined without a separator, as Codex joins them. */
  text: string;
  imageCount: number;
  /** `local_image` paths, for matching an image-only send. */
  localImagePaths: string[];
  /** Chips for parts that are neither text, images, skills nor mentions. */
  attachmentLabels: string[];
  /** Names of `skill` parts: the skills the TUI recognized. */
  skillNames: string[];
}

export function userContent(text: string, extra: Partial<CodexUserContent> = {}): CodexUserContent {
  return {
    text,
    imageCount: 0,
    localImagePaths: [],
    attachmentLabels: [],
    skillNames: [],
    ...extra,
  };
}

export interface CodexAsyncQuestion {
  title: string;
  options: string[];
}

export interface CodexAgentContent {
  text: string;
  phase: string | null;
  /** Questions asked with `delivery: async`; empty for ordinary text. */
  questions: CodexAsyncQuestion[];
}

export interface CodexSyncQuestion {
  id: string | null;
  header: string | null;
  text: string;
  options: ChatQuestionOption[];
}

/** A tool row as the record that placed it describes it; `status` null while no outcome. */
export interface CodexToolSnapshot {
  subagentActivity: ChatSubagentActivity | null;
  imagePath: string | null;
  kind: ToolKind;
  name: string;
  title: string;
  subtitle: string | null;
  status: ToolStatus | null;
  note: string | null;
  diff: ChatDiffStats | null;
  exitCode: number | null;
  callID: string | null;
  preview: ChatToolPreview | null;
  output: ChatOutputReference | null;
}

export function snapshot(
  init: Pick<CodexToolSnapshot, 'kind' | 'name' | 'title'> & Partial<CodexToolSnapshot>,
): CodexToolSnapshot {
  return {
    subagentActivity: null,
    imagePath: null,
    subtitle: null,
    status: null,
    note: null,
    diff: null,
    exitCode: null,
    callID: null,
    preview: null,
    output: null,
    ...init,
  };
}

export type CodexItemContent =
  | { type: 'user'; value: CodexUserContent }
  | { type: 'agent'; value: CodexAgentContent }
  | { type: 'reasoning'; text: string; durationMilliseconds: number | null }
  | { type: 'plan'; text: string }
  | { type: 'compaction' }
  | { type: 'hook'; text: string }
  | { type: 'review'; title: string; detail: string | null }
  | { type: 'tool'; value: CodexToolSnapshot };

export interface CodexItem {
  id: string;
  content: CodexItemContent;
}

export interface CodexQuestionCall {
  callID: string;
  turnID: string | null;
  questions: CodexSyncQuestion[];
}

export interface CodexVerifiedAnswer {
  turnID: string | null;
  callID: string;
  answers: { question: string; answer: string }[];
}

export interface CodexCallOutput {
  callID: string;
  /** A question call's answers by question id, newline-joined; null when not an answer object. */
  answers: Record<string, string> | null;
  /** Codex closed the question without answers. */
  isCancelled: boolean;
  /** The user stopped the call: a code-mode `exec` output that starts "aborted by user". */
  isAbortedByUser: boolean;
  exitCode: number | null;
  preview: ChatToolPreview | null;
  output: ChatOutputReference;
}

export function callOutput(
  callID: string,
  output: ChatOutputReference,
  extra: Partial<CodexCallOutput> = {},
): CodexCallOutput {
  return {
    callID,
    answers: null,
    isCancelled: false,
    isAbortedByUser: false,
    exitCode: null,
    preview: null,
    output,
    ...extra,
  };
}

export interface CodexCodeModePatch {
  callID: string;
  turnID: string | null;
  snapshot: CodexToolSnapshot;
}

export type CodexToolCallRole =
  | { type: 'tool'; snapshot: CodexToolSnapshot }
  | { type: 'question'; questions: CodexSyncQuestion[] }
  /** `request_user_input_async`: no row; it names the questions the next assistant message asks. */
  | { type: 'asyncQuestions' };

export interface CodexToolCall {
  callID: string;
  role: CodexToolCallRole;
}

/** Where a legacy event places its item (`ThreadHistoryBuilder`). */
export type CodexLegacyPlacement =
  | { type: 'turn'; turnID: string }
  | { type: 'turnOrCurrent'; turnID: string | null }
  | { type: 'current' }
  | { type: 'review'; turnID: string | null };

/** ISO 8601 strings, null when the event does not say. */
export interface CodexTurnTimes {
  startedAt: string | null;
  completedAt: string | null;
}

export type CodexRecord =
  | { type: 'turnStarted'; turnID: string; rootTurnID: string | null; times: CodexTurnTimes }
  | { type: 'turnCompleted'; turnID: string; error: string | null; times: CodexTurnTimes }
  | {
      type: 'turnAborted';
      turnID: string | null;
      reason: string;
      error: string | null;
      times: CodexTurnTimes;
    }
  | { type: 'item'; turnID: string; item: CodexItem }
  | { type: 'questionCall'; call: CodexQuestionCall }
  | { type: 'verifiedAnswer'; answer: CodexVerifiedAnswer }
  | { type: 'callOutput'; output: CodexCallOutput }
  | { type: 'codeModePatch'; patch: CodexCodeModePatch }
  // Legacy rollouts.
  | { type: 'userMessage'; content: CodexUserContent }
  | { type: 'agentMessage'; content: CodexAgentContent }
  | { type: 'reasoning'; text: string }
  | { type: 'contextCompacted' }
  | { type: 'compacted' }
  | { type: 'rolledBack'; turns: number }
  | { type: 'toolCall'; call: CodexToolCall }
  | { type: 'legacyItem'; item: CodexItem; placement: CodexLegacyPlacement };

export type CodexRolloutDialect = 'paginated' | 'legacy';

/** What decoding one line produced. */
export interface CodexLineOutcome {
  record: CodexRecord | null;
  /** False when Codex itself would reject the line, so it must not take an ordinal. */
  isAccepted: boolean;
  isInvalid: boolean;
  /** The line was too long to keep whole and its content had to be skipped. */
  isOversized: boolean;
  /** A record, event or item type this adapter does not know. */
  unknownType: string | null;
}

export const ACCEPTED: CodexLineOutcome = {
  record: null,
  isAccepted: true,
  isInvalid: false,
  isOversized: false,
  unknownType: null,
};
export const INVALID: CodexLineOutcome = { ...ACCEPTED, isAccepted: false, isInvalid: true };
export const OVERSIZED: CodexLineOutcome = { ...ACCEPTED, isOversized: true };

export function withRecord(record: CodexRecord): CodexLineOutcome {
  return { ...ACCEPTED, record };
}

export function unknownOutcome(type: string, accepted = false): CodexLineOutcome {
  return { ...ACCEPTED, isAccepted: accepted, unknownType: type };
}

/** One decoded line, kept in place of its bytes. */
export interface CodexStoredLine {
  offset: number;
  length: number;
  ordinal: number | null;
  outcome: CodexLineOutcome;
}

export function storedEnd(line: CodexStoredLine): number {
  return line.offset + line.length + 1;
}
