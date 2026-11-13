// Row classification the projection folds by (Swift ChatTimelineProjection "Rows").

import type { ChatRow } from './row';

/** Rows that open a turn and show above its fold. */
export function holdsHead(row: ChatRow): boolean {
  const type = row.content.type;
  return type === 'user' || type === 'pending' || type === 'notice' || type === 'divider';
}

/** Rows a fold never hides: what the user decides or must see, and what marks the turn's course. */
export function isPinned(row: ChatRow): boolean {
  const content = row.content;
  switch (content.type) {
    case 'plan':
    case 'questions':
    case 'user':
    case 'pending':
    case 'divider':
    case 'olderHistory':
      return true;
    case 'notice':
      return (
        content.notice.kind === 'interrupted' ||
        content.notice.kind === 'stopped' ||
        content.notice.kind === 'error'
      );
    case 'tool':
      return (
        content.tool.status === 'awaitingApproval' ||
        content.tool.kind === 'agent' ||
        content.tool.kind === 'question'
      );
    default:
      return false;
  }
}

/** Calls a group can hold: not Subagents, questions or calls waiting on the user, nor a Codex user shell command. */
export function isGroupable(row: ChatRow): boolean {
  const content = row.content;
  if (content.type !== 'tool') return false;
  const { tool } = content;
  if (tool.status === 'awaitingApproval' || tool.name === 'user_shell') return false;
  return tool.kind !== 'agent' && tool.kind !== 'question';
}

export const isAwaiting = (row: ChatRow): boolean =>
  row.content.type === 'tool' && row.content.tool.status === 'awaitingApproval';

export const isReasoning = (row: ChatRow): boolean => row.content.type === 'reasoning';

/**
 * The harness talking, not the user or the Agent: a task notification ("Background command ...
 * completed"). It opens the turn the Agent answers it in, but shows no row; Background Work reads
 * the records it came from.
 */
export const isHarnessNotice = (row: ChatRow): boolean =>
  row.content.type === 'notice' && row.content.notice.kind === 'taskNotification';

export const isBlank = (row: ChatRow): boolean =>
  row.content.type === 'reasoning' && row.content.reasoning.text === '';
