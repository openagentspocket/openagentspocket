import {
  filterByHost,
  groupRows,
  type ListGroup,
  type ListPresentation,
  searchRows,
  statusGroups,
  statusInboxItems,
} from '@openagentspocket/core';
import { useCallback, useMemo, useState } from 'react';
import { useConsoleState, useConsoleStore } from '../../console/hooks';

/** The Agents list: filter and search over the Console store, then the chosen grouping. */
export function useAgentsList() {
  const store = useConsoleStore();
  const { rows, hosts, revision } = useConsoleState();
  const [presentation, setPresentation] = useState<ListPresentation>('flat');
  const [hostId, setHostId] = useState<string | undefined>();
  const [query, setQuery] = useState('');
  // Idle starts folded in By Status, as in the Status Inbox.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set(['idle']));

  const toggle = useCallback((id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: revision signals pin and clock changes
  const groups: readonly ListGroup[] = useMemo(() => {
    const visible = searchRows(filterByHost(rows, hostId), query);
    if (presentation === 'byStatus') {
      const items = statusInboxItems({
        rows: visible,
        stamps: (key) => store.stamp(key),
        pinRank: (row) => (store.isPinned(row.hostId, row.agent.pane_id) ? 0 : undefined),
        lastMessage: () => undefined,
        savedKeys: new Set(),
        now: Date.now(),
      });
      return statusGroups(items, query);
    }
    return groupRows(visible, presentation, { hosts, query, hostId });
  }, [rows, hosts, hostId, query, presentation, store, revision]);

  return {
    store,
    hosts,
    groups,
    presentation,
    setPresentation,
    hostId,
    setHostId,
    query,
    setQuery,
    collapsed,
    toggle,
    hasAgents: rows.length > 0,
  };
}
