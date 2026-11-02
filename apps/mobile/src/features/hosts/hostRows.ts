import { type Host, hostConnectionSummary, primaryRoute } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import type { Status } from '@openagentspocket/ui';
import type { HostConnection, HostsSnapshot } from './HostsModel';

/** The list's groups, in the order they appear. */
export const GROUP_ORDER = ['cantConnect', 'connecting', 'connected', 'notConnected'] as const;

export function groupTitle(group: HostConnection): string {
  switch (group) {
    case 'cantConnect':
      return t("Can't Connect");
    case 'connecting':
      return t('Trying');
    case 'connected':
      return t('Connected');
    case 'notConnected':
      return t('Not Connected');
  }
}

export function groupStatus(group: HostConnection): Status {
  switch (group) {
    case 'cantConnect':
      return 'blocked';
    case 'connecting':
      return 'working';
    case 'connected':
      return 'done';
    case 'notConnected':
      return 'idle';
  }
}

/** Hosts per connection group, empty groups left out. */
export function groupHosts(snapshot: HostsSnapshot): { group: HostConnection; hosts: Host[] }[] {
  return GROUP_ORDER.map((group) => ({
    group,
    hosts: snapshot.hosts.filter(
      (host) => (snapshot.connections[host.id] ?? 'notConnected') === group,
    ),
  })).filter((entry) => entry.hosts.length > 0);
}

/** `user@address[:port]`, or the user and the route count when there are several. */
export function connectionLine(host: Host): string {
  const summary = hostConnectionSummary(host);
  return summary.kind === 'address'
    ? summary.text
    : `${summary.username} · ${t('Routes')} ${summary.count}`;
}

/**
 * The row title: the Host's name, else its address (the subtitle already carries
 * `user@address`, so the title must not repeat it).
 */
export function hostTitle(host: Host): string {
  const name = host.name.trim();
  return name === '' ? primaryRoute(host).address : name;
}
