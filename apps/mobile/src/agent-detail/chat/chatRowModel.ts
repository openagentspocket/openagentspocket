import type {
  ChatPendingEchoState,
  ChatToolActivity,
  ToolKind,
  ToolStatus,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import type { ChatUserBubbleStatus, IconName } from '@openagentspocket/ui';

type RowToolStatus = 'running' | 'waiting' | 'done' | 'failed';

/** The row's state ink: running and waiting calls differ from finished ones. */
export function rowToolStatus(status: ToolStatus, isNotUpdating = false): RowToolStatus {
  switch (status) {
    case 'running':
    case 'started':
      return isNotUpdating ? 'done' : 'running';
    case 'awaitingApproval':
      return 'waiting';
    case 'failed':
    case 'declined':
    case 'interrupted':
    case 'notCompleted':
      return 'failed';
    default:
      return 'done';
  }
}

const ICONS: Partial<Record<ToolKind, IconName>> = {
  command: 'terminal',
  fileEdit: 'file',
  fileWrite: 'file',
  fileRead: 'file',
  search: 'search',
  listing: 'folder',
  web: 'globe',
  agent: 'bot',
};

export const toolIcon = (kind: ToolKind): IconName => ICONS[kind] ?? 'terminal';

/** "Exit 1", "Waiting" or nothing: the trailing state of a tool row. */
export function toolStatusLabel(tool: ChatToolActivity): string | undefined {
  const status = rowToolStatus(tool.status, tool.isNotUpdating);
  if (status === 'waiting') return t('Waiting');
  if (status === 'failed' && tool.exitCode !== null) return t('Exit %lld', tool.exitCode);
  if (status === 'failed') return t('Failed');
  return undefined;
}

/** 26 -> "26s", 105 -> "1:45". */
export function durationText(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) return `${whole}s`;
  const rest = whole % 60;
  return `${Math.floor(whole / 60)}:${rest < 10 ? '0' : ''}${rest}`;
}

/**
 * What a message Chat sent shows under its bubble once it left the Composer (Swift ChatPendingBubble):
 * nothing while it is sent, and what went wrong or is still unknown otherwise. `sending` has its own
 * dimmed bubble and caption.
 */
export function echoStatus(state: ChatPendingEchoState): ChatUserBubbleStatus | undefined {
  switch (state.kind) {
    case 'sending':
    case 'sent':
      return undefined;
    case 'unconfirmed':
      return {
        text: t("Sent. It hasn't appeared in the conversation yet."),
        icon: 'clock',
        tone: 'secondary',
      };
    case 'failed':
      return { text: t('Not sent. %@', state.reason), icon: 'warning', tone: 'danger' };
    case 'notDelivered':
      return {
        text: t("Not delivered. The text is still in the Agent's input box."),
        icon: 'warning',
        tone: 'warning',
      };
    case 'discarded':
      return {
        text: t("Not delivered. It's no longer in the Agent's input box."),
        icon: 'warning',
        tone: 'warning',
      };
    case 'refused':
      return { text: state.reason, icon: 'info', tone: 'secondary' };
    case 'misdirected':
      return {
        text: t('Sent, but the Agent recorded it in another session.'),
        icon: 'warning',
        tone: 'warning',
      };
  }
}
