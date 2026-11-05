import type { HostLink } from '@openagentspocket/core';
import { useMemo } from 'react';
import { useConsoleState } from '@/console/hooks';
import type { HostConnection } from './HostsModel';
import { useHosts } from './useHosts';

/** The Hosts views' vocabulary for a link: a resuming Host keeps reading as connected. */
export function linkToConnection(link: HostLink): HostConnection {
  switch (link) {
    case 'live':
    case 'resuming':
      return 'connected';
    case 'connecting':
      return 'connecting';
    case 'stopped':
      return 'notConnected';
    case 'offline':
      return 'cantConnect';
  }
}

/**
 * Every Host's connection as the Hosts list and detail show it: the live session's link where the
 * Console has one (one answer for Home, the lists and the detail), otherwise what the preflight
 * checks last recorded.
 */
export function useHostConnections(): Readonly<Record<string, HostConnection>> {
  const checked = useHosts().connections;
  const { hosts } = useConsoleState();
  return useMemo(() => {
    const merged: Record<string, HostConnection> = { ...checked };
    for (const host of hosts) merged[host.id] = linkToConnection(host.link);
    return merged;
  }, [checked, hosts]);
}
