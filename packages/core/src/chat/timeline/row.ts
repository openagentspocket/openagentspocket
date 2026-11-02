// The Chat timeline's row model (Swift ChatRow, ChatRowID, ChatTurnHeader, ChatToolGroup,
// ChatTurnSignals). Rows carry no parsed Markdown: the UI parses `assistant.source` and
// `plan.plan.text` itself. Row ids are strings so they key Sets, Maps and list items directly.

import type { Text } from '../../errors/text';
import type { EventsSessionStatus } from '../../events/types';
import type {
  ChatAgentActivity,
  ChatDivider,
  ChatNotice,
  ChatPlan,
  ChatQuestion,
  ChatReasoning,
  ChatToolActivity,
  ChatUserMessage,
  ToolKind,
} from '../model/types';

declare const rowIdBrand: unique symbol;
/** One row's identity: `entry:<id>`, `pending:<id>`, `older`, `liveTurn`, `turn:<id>`, `group:<id>`, `liveGroup:<id>`. */
export type ChatRowID = string & { readonly [rowIdBrand]: true };

const make = (value: string) => value as ChatRowID;

export const rowID = {
  /** A transcript entry. */
  entry: (id: string) => make(`entry:${id}`),
  /** A message sent from Chat that the transcript does not show yet. */
  pending: (id: string) => make(`pending:${id}`),
  /** The top row while earlier history can load, is loading, or failed. */
  olderHistory: make('older'),
  /** The running turn's header. Only the newest turn runs. */
  liveTurn: make('liveTurn'),
  /** A finished turn's fold, by the first entry of its final answer. */
  turn: (answer: string) => make(`turn:${answer}`),
  /** A settled tool group, by its last call. */
  group: (lastCall: string) => make(`group:${lastCall}`),
  /** A running tool group, by its first call: it grows at its end. */
  liveGroup: (firstCall: string) => make(`liveGroup:${firstCall}`),
} as const;

/** The entry id of an `entry:` row id, else null. */
export function entryOf(id: ChatRowID): string | null {
  return id.startsWith('entry:') ? id.slice('entry:'.length) : null;
}

/** Whether the row folds others away rather than showing an entry. */
export function isHeaderID(id: ChatRowID): boolean {
  return (
    id === 'liveTurn' ||
    id.startsWith('turn:') ||
    id.startsWith('group:') ||
    id.startsWith('liveGroup:')
  );
}

export type ChatOlderHistory = 'reachedStart' | 'available' | 'loading' | { failed: string };

export type ChatPendingEchoState =
  | { kind: 'sending' }
  | { kind: 'sent' }
  /** Sent a while ago, and the transcript still does not show it. */
  | { kind: 'unconfirmed' }
  | { kind: 'failed'; reason: string }
  /** The text stayed in the Agent's input box. Never resent. */
  | { kind: 'notDelivered' }
  | { kind: 'discarded' }
  | { kind: 'refused'; reason: string }
  | { kind: 'misdirected' };

/** A message sent from Chat, shown at the end of the timeline until the transcript records it. */
export interface ChatPendingEcho {
  id: string;
  text: string;
  state: ChatPendingEchoState;
}

/** The header of a turn: how long the running turn has worked, or the fold over a finished one. */
export interface ChatTurnHeader {
  state: { kind: 'working'; since: string } | { kind: 'worked'; seconds: number | null };
  isOpen: boolean;
  /** The rows the fold holds. */
  stepCount: number;
}

/** Consecutive tool calls shown as one summary row. */
export interface ChatToolGroup {
  /** "Ran 2 commands, Edited 2 files", unresolved so the UI translates it. */
  summary: Text;
  /** The first call's kind, whose symbol the header shows. */
  kind: ToolKind;
  /** Lines added and removed across the calls, null when none recorded any. */
  added: number | null;
  removed: number | null;
  /** Calls that failed, were declined, interrupted or not completed. */
  failed: number;
  isRunning: boolean;
  calls: number;
  isOpen: boolean;
}

export type ChatRowContent =
  | { type: 'user'; message: ChatUserMessage }
  | { type: 'assistant'; source: string }
  | { type: 'reasoning'; reasoning: ChatReasoning }
  | { type: 'tool'; tool: ChatToolActivity }
  | { type: 'plan'; plan: ChatPlan }
  | { type: 'questions'; questions: ChatQuestion[] }
  | { type: 'notice'; notice: ChatNotice }
  | { type: 'divider'; divider: ChatDivider }
  | { type: 'pending'; echo: ChatPendingEcho }
  | { type: 'olderHistory'; older: ChatOlderHistory }
  | { type: 'turnHeader'; header: ChatTurnHeader }
  | { type: 'toolGroup'; group: ChatToolGroup };

export interface ChatRow {
  id: ChatRowID;
  content: ChatRowContent;
  /** Changes exactly when `content` does, so a measured height is never taken for another revision. */
  revision: number;
  /** Space above the row: tight within a turn, looser between turns. */
  topSpacing: number;
  /** Shown inside an open tool group, under its header. */
  isNested: boolean;
  /** The model's text inside an open turn fold, which reads as the process rather than the answer. */
  isMuted: boolean;
}

export function chatRow(
  id: ChatRowID,
  content: ChatRowContent,
  revision: number,
  topSpacing = 0,
): ChatRow {
  return { id, content, revision, topSpacing, isNested: false, isMuted: false };
}

/** Whether a tap shows more of the row. */
export function isExpandable(row: ChatRow): boolean {
  const content = row.content;
  switch (content.type) {
    case 'tool':
    case 'toolGroup':
      return true;
    case 'reasoning':
      return content.reasoning.text !== '';
    case 'turnHeader':
      return content.header.state.kind === 'worked';
    default:
      return false;
  }
}

/** What decides how a turn shows: whether the newest one still runs, and whether finished ones fold. */
export interface ChatTurnSignals {
  activity: ChatAgentActivity;
  /** Background Work still runs, which keeps the newest turn open. */
  isBackgroundWorkRunning: boolean;
  /** The Fold Finished Turns setting. */
  foldsFinishedTurns: boolean;
  /** The Host is connected and the rows come from it; otherwise they read as last seen. */
  isLive: boolean;
  /** Earlier messages load only when the user asks, so the turn whose start they hold reads as finished. */
  olderAwaitsUser: boolean;
}

export function turnSignals(partial: Partial<ChatTurnSignals> = {}): ChatTurnSignals {
  return {
    activity: 'unknown',
    isBackgroundWorkRunning: false,
    foldsFinishedTurns: true,
    isLive: true,
    olderAwaitsUser: false,
    ...partial,
  };
}

/**
 * Whether something live backs the rows: the Host is connected and the conversation came from it
 * on this visit. A failed read alone keeps them live, so one missed poll doesn't flicker them.
 */
export function isLiveRows(
  hostStatus: EventsSessionStatus | null | undefined,
  conversation: { readonly isFromCache: boolean },
): boolean {
  return hostStatus?.kind === 'connected' && !conversation.isFromCache;
}

/** A stable 32-bit hash (FNV-1a) of the parts, for revisions derived from content. */
export function hashRevision(...parts: readonly (string | number | boolean)[]): number {
  let hash = 0x811c9dc5;
  for (const char of parts.join('\u001f')) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

const isStep = (type: ChatRowContent['type']) =>
  type === 'tool' || type === 'reasoning' || type === 'toolGroup';

/** A user's message starts a turn and gets the most room; the steps of one turn sit close together. */
export function topSpacing(content: ChatRowContent, previous: ChatRowContent | null): number {
  if (previous === null) return 8;
  switch (content.type) {
    case 'user':
    case 'pending':
      return 24;
    case 'tool':
    case 'reasoning':
    case 'toolGroup':
      return isStep(previous.type) ? 4 : 10;
    case 'turnHeader':
      return 10;
    case 'divider':
      return 20;
    case 'olderHistory':
      return 0;
    default:
      return 12;
  }
}
