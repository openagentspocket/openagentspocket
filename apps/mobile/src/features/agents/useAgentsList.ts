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
import { useHostScope } from '../../console/useHostScope';

/** The Agents list: filter and search over the Console store, then the chosen grouping. */
export function useAgentsList() {
  const store = useConsoleStore();
  const { rows, hosts, revision } = useConsoleState();
  const prefs = store.listPrefs;
  const [presentation, setPresentationState] = useState<ListPresentation>(prefs.presentation);
  const scope = useHostScope();
  const { hostId } = scope;
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(prefs.collapsed);

  const setPresentation = useCallback(
    (next: ListPresentation) => {
      prefs.setPresentation(next);
      setPresentationState(next);
    },
    [prefs],
  );
  const toggle = useCallback(
    (id: string) => {
      prefs.toggleCollapsed(id);
      setCollapsed(prefs.collapsed);
    },
    [prefs],
  );

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
    setHostId: scope.setHostId,
    hostLabel: scope.label,
    hostItems: scope.items,
    query,
    setQuery,
    collapsed,
    toggle,
    hasAgents: rows.length > 0,
  };
}
