import type { ChatToolActivity, ToolKind, ToolStatus } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import type { IconName } from '@openagentspocket/ui';

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
