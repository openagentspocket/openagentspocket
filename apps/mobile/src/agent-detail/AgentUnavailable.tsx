import { t } from '@openagentspocket/i18n';
import { Button, ConnectionPanel, EmptyState } from '@openagentspocket/ui';
import { useRouter } from 'expo-router';
import { useConsoleState } from '@/console/hooks';
import { isConnectionDown, useHostConnection } from '@/features/hosts/useHostConnection';
import { useHosts } from '@/features/hosts/useHosts';
import { AppScreen } from '@/navigation/AppScreen';
import { hrefs } from '@/navigation/hrefs';

/**
 * An Agent the console does not list: gone once its Host's fresh snapshot lacks it. Otherwise
 * nothing is known yet, which must never read as gone: while the Host's link is down (first dial,
 * reconnecting, failed, stopped) the screen shows that link as the Host's connection sheet does,
 * with the same actions; while it is up and the snapshot is on its way, a wait. A Host that is
 * neither in the Console nor saved was removed: no wait will ever end, so it says so and leads Home.
 */
export function AgentUnavailable({ gone, hostId }: { gone: boolean; hostId: string }) {
  const host = useConsoleState().hosts.find((candidate) => candidate.id === hostId);
  const connection = useHostConnection(hostId);
  const saved = useHosts().hosts.some((candidate) => candidate.id === hostId);
  const router = useRouter();
  if (gone) {
    return (
      <AppScreen scroll={false} testID="agent-gone">
        <EmptyState icon="info" title={t('Agent Gone')} />
      </AppScreen>
    );
  }
  if (!host && !saved) {
    return (
      <AppScreen scroll={false} testID="agent-host-removed">
        <EmptyState
          icon="server"
          title={t('Host Not Saved')}
          message={t('This Host is no longer saved, so its Agents are not available.')}
          actions={
            <Button
              title={t('Go to Home')}
              onPress={() => router.replace(hrefs.home())}
              testID="agent-host-removed-home"
            />
          }
        />
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
