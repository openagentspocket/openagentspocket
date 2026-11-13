import { t } from '@openagentspocket/i18n';
import { ConnectionPanel, EmptyState } from '@openagentspocket/ui';
import { useConsoleState } from '@/console/hooks';
import { isConnectionDown, useHostConnection } from '@/features/hosts/useHostConnection';
import { AppScreen } from '@/navigation/AppScreen';

/**
 * An Agent the console does not list: gone once its Host's fresh snapshot lacks it. Otherwise
 * nothing is known yet, which must never read as gone: while the Host's link is down (first dial,
 * reconnecting, failed, stopped) the screen shows that link as the Host's connection sheet does,
 * with the same actions; while it is up and the snapshot is on its way, a wait.
 */
export function AgentUnavailable({ gone, hostId }: { gone: boolean; hostId: string }) {
  const host = useConsoleState().hosts.find((candidate) => candidate.id === hostId);
  const connection = useHostConnection(hostId);
  if (gone) {
    return (
      <AppScreen scroll={false} testID="agent-gone">
        <EmptyState icon="info" title={t('Agent Gone')} />
      </AppScreen>
    );
  }
  if (host && connection && isConnectionDown(host)) {
    return (
      <AppScreen testID="agent-host-down">
        <ConnectionPanel {...connection} testID="agent-host-connection" />
      </AppScreen>
    );
  }
  return (
    <AppScreen scroll={false} testID="agent-loading">
      <EmptyState icon="wifi" title={t('Reconnecting…')} />
    </AppScreen>
  );
}
