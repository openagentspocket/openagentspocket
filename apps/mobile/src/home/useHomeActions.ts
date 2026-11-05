import type { StatusInboxItem } from '@openagentspocket/core';
import { useMemo } from 'react';
import { useConsoleStore } from '../console/hooks';
import { agentActions } from '../features/agents/agentActions';
import { closeAgent } from '../features/agents/closeAgent';

/** Pin and Close (after asking) for an inbox card, bound to the Console store. */
export function useHomeActions() {
  const store = useConsoleStore();
  return useMemo(() => {
    const actions = agentActions(store);
    return {
      pin: (item: StatusInboxItem) => actions.togglePin(item.row),
      close: (item: StatusInboxItem) => closeAgent(item.row, actions).then(() => undefined),
    };
  }, [store]);
}
