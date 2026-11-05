import type { Host } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { HostIssueRow, useHandoverSheet } from '@openagentspocket/ui';
import { useRouter } from 'expo-router';
import { failureText } from '@/connections/failureText';
import { useConsoleState, useConsoleStore } from '@/console/hooks';
import { homeLabels } from '@/home/homeLabels';
import { hostState } from '@/home/homeModel';
import { hrefs } from '@/navigation/hrefs';
import { HostConnectionSheet } from './HostConnectionSheet';
import { routeLine } from './HostInfoSections';
import { useHosts } from './useHosts';

/**
 * The amber "<Host> is offline" lines of a list, and the one connection sheet they open: the
 * reconnect state comes from the Console store (attempt, failure, route), Retry Now and Stop
 * Connecting act on the Host's session. Home and the Agents list both render this.
 */
export function HostIssues() {
  const router = useRouter();
  const { hosts } = useConsoleState();
  const store = useConsoleStore();
  const saved = useHosts().hosts;
  const sheet = useHandoverSheet<string>();
  const openId = sheet.value;
  const offline = hosts.filter((host) => hostState(host) === 'offline');
  const open = hosts.find((host) => host.id === openId);
  const status = open?.status;
  const failure =
    status?.kind === 'reconnecting' || status?.kind === 'failed'
      ? failureText(status.failure)
      : undefined;
  const savedHost: Host | undefined = saved.find((host) => host.id === openId);
  return (
    <>
      <HostIssueRow
        issues={offline.map((host) => ({ hostName: host.name || t('Offline'), kind: 'offline' }))}
        labels={homeLabels()}
        onOpen={(issue) => {
          const id = hosts.find((host) => host.name === issue?.hostName)?.id;
          if (id) sheet.open(id);
        }}
      />
      {open ? (
        <HostConnectionSheet
          visible={sheet.visible}
          hostName={open.name}
          stopped={open.link === 'stopped'}
          attempt={status?.kind === 'reconnecting' ? status.attempt : undefined}
          routes={savedHost ? routeLine(savedHost, open.routeId ?? null) : ''}
          failure={failure && { title: failure.summary, detail: failure.detail }}
          onRetry={() => void store.retry(open.id)}
          onStop={() => void store.stopConnecting(open.id)}
          onEdit={() => sheet.closeThen(() => router.push(hrefs.hostForm({ edit: open.id })))}
          onClose={sheet.close}
          onDismissed={sheet.onDismissed}
        />
      ) : null}
    </>
  );
}
