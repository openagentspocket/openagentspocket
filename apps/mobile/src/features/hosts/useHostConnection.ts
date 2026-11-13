import type { Host } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import type { ConnectionStatus } from '@openagentspocket/ui';
import { useRouter } from 'expo-router';
import { failureText } from '@/connections/failureText';
import { useConsoleState, useConsoleStore } from '@/console/hooks';
import type { HostSummary } from '@/console/store';
import { hrefs } from '@/navigation/hrefs';
import { routeLine } from './HostInfoSections';
import { hostsRuntime } from './hostsRuntime';
import { useHosts } from './useHosts';

/**
 * Whether a Host's link is down in a way its owner should see: still on its first dial, stopped,
 * or a confirmed failure. A live or resuming Host keeps its last known good state.
 */
export function isConnectionDown(host: HostSummary): boolean {
  return host.link === 'connecting' || host.link === 'stopped' || host.link === 'offline';
}

/** What a Host's connection does about its link, as the sheet and the Agent screen show it. */
export interface HostConnectionActions {
  retry: () => void;
  stop: () => void;
  edit: () => void;
  pairAgain: () => void;
}

/** The connection state of one Host and its actions: one model for every surface that shows it. */
export function hostConnectionStatus(
  host: HostSummary,
  saved: Host | undefined,
  actions: HostConnectionActions,
): ConnectionStatus {
  const status = host.status;
  const stopped = host.link === 'stopped';
  const failed =
    status?.kind === 'reconnecting' || status?.kind === 'failed'
      ? failureText(status.failure)
      : undefined;
  return {
    title: host.name,
    state: stopped
      ? { icon: 'wifiSlash', label: t('Stopped') }
      : status?.kind === 'reconnecting'
        ? { icon: 'network', label: t('Reconnecting'), note: t('Attempt %lld', status.attempt) }
        : host.link === 'connecting'
          ? { icon: 'network', label: t('Connecting…') }
          : { icon: 'wifiSlash', label: t('Offline') },
    detail: saved ? routeLine(saved, host.routeId ?? null) : '',
    failure: failed && { title: failed.summary, detail: failed.detail },
    primary: { label: stopped ? t('Connect') : t('Retry Now'), onPress: actions.retry },
    secondary: stopped ? undefined : { label: t('Stop Connecting'), onPress: actions.stop },
    edit: { label: t('Edit'), onPress: actions.edit },
    more: [{ key: 'pair-again', label: t('Pair Again'), onPress: actions.pairAgain }],
  };
}

/**
 * One Host's connection from the Console store, with the actions every surface offers. Retry goes
 * through the live connections, which forget a refused key there so the prompt comes back (the
 * demo build has none, so the store); Stop Connecting acts on the Host's session; Edit and Pair
 * Again leave through `leave` (a sheet closes first). Undefined for a Host the Console lacks.
 */
export function useHostConnection(
  hostId: string | undefined,
  leave: (go: () => void) => void = (go) => go(),
): ConnectionStatus | undefined {
  const router = useRouter();
  const store = useConsoleStore();
  const host = useConsoleState().hosts.find((candidate) => candidate.id === hostId);
  const saved = useHosts().hosts.find((candidate) => candidate.id === hostId);
  if (!host) return undefined;
  const id = host.id;
  return hostConnectionStatus(host, saved, {
    retry: () => void (hostsRuntime().reconnect?.(id) ?? store.retry(id)),
    stop: () => void store.stopConnecting(id),
    edit: () => leave(() => router.push(hrefs.hostForm({ edit: id }))),
    pairAgain: () => leave(() => router.push(hrefs.easyPair())),
  });
}
