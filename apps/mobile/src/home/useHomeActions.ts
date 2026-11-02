import type { StatusInboxItem } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { confirm } from '@openagentspocket/ui';
import { useMemo } from 'react';
import { useConsoleStore } from '../console/hooks';
import { agentActions } from '../features/agents/agentActions';

/** Pin and Close (after asking) for an inbox card, bound to the Console store. */
export function useHomeActions() {
  const store = useConsoleStore();
  return useMemo(() => {
    const actions = agentActions(store);
    return {
      pin: (item: StatusInboxItem) => actions.togglePin(item.row),
      close: async (item: StatusInboxItem) => {
        const { agent } = item.row;
        const ok = await confirm({
          title: t('Close %@?', agent.name ?? agent.agent ?? agent.pane_id),
          confirmLabel: t('Close'),
          destructive: true,
        });
        if (ok) await actions.close(item.row).catch(() => undefined);
      },
    };
  }, [store]);
}
