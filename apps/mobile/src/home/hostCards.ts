import { type Host, primaryRoute } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import type { HomeHost } from '@openagentspocket/ui';
import type { HostSummary } from '@/console/store';
import { hostState } from './homeModel';

/** What a Host card says under its name. */
export function hostSummaryText(host: HostSummary, agentCount: number): string {
  switch (hostState(host)) {
    case 'loading':
      return t('Loading Agents…');
    case 'offline':
      return t('Offline');
    case 'live':
      return agentCount === 0 ? t('No Agents') : t('%lld Agents', agentCount);
  }
}

/** The Host card model: address from the saved Host, readiness and its tone dot. */
export function presentHost(
  host: HostSummary,
  agentCount: number,
  saved: readonly Host[],
): HomeHost {
  const record = saved.find((candidate) => candidate.id === host.id);
  const state = hostState(host);
  return {
    name: host.name,
    address: record ? primaryRoute(record).address : '',
    readiness: hostSummaryText(host, agentCount),
    tone: state === 'live' ? 'success' : state === 'offline' ? 'warning' : 'neutral',
  };
}
