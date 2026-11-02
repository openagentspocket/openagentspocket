// Rows and turns of the legacy builder, and how a call's row merges with its output or end event.

import type { CodexCallOutput, CodexToolSnapshot } from './record';
import type { CodexQuestionBuild, CodexTimelineEntry, CodexTurnStatus } from './timeline';

export interface Item {
  /** The id rows are upserted by: a call or item id, or the line's offset for messages. */
  key: string;
  entry: CodexTimelineEntry;
  question: CodexQuestionBuild | null;
}

export interface Turn {
  id: string;
  isExplicit: boolean;
  sawCompaction: boolean;
  /** Codex gives implicit turns `completed` until something says otherwise. */
  status: CodexTurnStatus;
  items: Item[];
  ending: CodexTimelineEntry | null;
  /** `request_user_input_async` calls whose questions the next assistant message asks. */
  asyncCalls: string[];
}

export function newTurn(id: string, isExplicit: boolean, status: CodexTurnStatus): Turn {
  return { id, isExplicit, sawCompaction: false, status, items: [], ending: null, asyncCalls: [] };
}

export function lastIndexOfKey(turn: Turn, key: string): number {
  for (let i = turn.items.length - 1; i >= 0; i -= 1)
    if ((turn.items[i] as Item).key === key) return i;
  return -1;
}

/** The row once its output arrived: an exit code decides success. */
export function applyingOutput(row: CodexToolSnapshot, output: CodexCallOutput): CodexToolSnapshot {
  const exitCode = output.exitCode ?? row.exitCode;
  return {
    ...row,
    exitCode,
    status: row.status ?? (exitCode === null || exitCode === 0 ? 'succeeded' : 'failed'),
    preview: output.preview ?? row.preview,
    output: output.output,
  };
}

/** The call's row with an end event's details: the event knows the outcome, the call the exit code. */
export function mergedWith(call: CodexToolSnapshot, end: CodexToolSnapshot): CodexToolSnapshot {
  return {
    ...end,
    exitCode: end.exitCode ?? call.exitCode,
    preview: end.preview ?? call.preview,
    status: end.status ?? call.status,
    note: end.note ?? call.note,
    imagePath: end.imagePath ?? call.imagePath,
  };
}
