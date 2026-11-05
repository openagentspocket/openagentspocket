import type { ConsoleRow } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { type ActionMenuItem, type AgentRowLabels, agentRowActions } from '@openagentspocket/ui';
import { useEntryMenus } from '@/navigation/entryMenus';

interface AgentMenuHandlers {
  pinned?: boolean;
  labels?: AgentRowLabels;
  onPin?: () => void;
  onDetails?: () => void;
  onRename?: () => void;
  onClose?: () => void;
}

/**
 * An Agent's action menu, one for every surface that lists Agents (the Agents list, the Session
 * drawer): the entry actions (Open, Changes, Ports, New Agent Here), then Pin, Details, Rename and
 * Close for the handlers the surface has.
 */
export function useAgentMenu(): (
  row: ConsoleRow,
  handlers?: AgentMenuHandlers,
) => ActionMenuItem[] {
  const entries = useEntryMenus();
  return (row, { pinned, labels, onPin, onDetails, onRename, onClose } = {}) => {
    const { menu } = agentRowActions({ pinned, labels, onPin, onDetails, onClose });
    const pin = menu.find((item) => item.key === 'pin');
    const details = menu.find((item) => item.key === 'details');
    const close = menu.find((item) => item.key === 'close');
    return [
      ...entries.agent(row),
      ...(pin ? [pin] : []),
      ...(details ? [details] : []),
      ...(onRename
        ? [{ key: 'rename', title: t('Rename…'), icon: 'edit' as const, onPress: onRename }]
        : []),
      ...(close ? [close] : []),
    ];
  };
}
