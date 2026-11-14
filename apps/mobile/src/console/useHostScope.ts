import { scopedHostId } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import type { ActionMenuItem } from '@openagentspocket/ui';
import { useCallback, useSyncExternalStore } from 'react';
import { useConsoleState, useConsoleStore } from './hooks';

/**
 * The Host every list is scoped to, one choice shared by Home, Agents and Terminals. `items` feed a
 * `HostScopeMenu`; they are empty with fewer than two Hosts, when there is nothing to choose.
 */
export function useHostScope() {
  const store = useConsoleStore();
  const { hosts } = useConsoleState();
  const prefs = store.listPrefs;
  const saved = useSyncExternalStore(prefs.subscribeHost, () => prefs.hostId);
  const hostId = scopedHostId(saved, hosts);
  const setHostId = useCallback((next: string | undefined) => prefs.setHostId(next), [prefs]);
  const items: ActionMenuItem[] =
    hosts.length > 1
      ? [
          {
            key: 'all',
            title: t('All Hosts'),
            checked: hostId === undefined,
            onPress: () => setHostId(undefined),
          },
          ...hosts.map((host) => ({
            key: host.id,
            title: host.name,
            checked: hostId === host.id,
            onPress: () => setHostId(host.id),
          })),
        ]
      : [];
  // One Host has no "all": the pill names it. Several default to All Hosts.
  const label =
    hosts.find((host) => host.id === hostId)?.name ??
    (hosts.length === 1 ? hosts[0]?.name : undefined) ??
    t('All Hosts');
  return { hostId, label, items, setHostId };
}
