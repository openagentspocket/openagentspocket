import { t } from '@openagentspocket/i18n';
import { HostIssueRow } from '@openagentspocket/ui';
import { useRouter } from 'expo-router';
import { useConsoleState } from '@/console/hooks';
import { homeLabels } from '@/home/homeLabels';
import { hostState } from '@/home/homeModel';
import { useHostConnectionSheet } from './HostConnectionSheet';

/**
 * The amber "<Host> is offline" lines of a list. One line opens that Host's connection sheet (the
 * state comes from the Console store); the summary line of three or more opens the Hosts list,
 * where every Host is. Home and the Agents list both render this.
 */
export function HostIssues() {
  const router = useRouter();
  const { hosts } = useConsoleState();
  const connection = useHostConnectionSheet();
  const offline = hosts.filter((host) => hostState(host) === 'offline');
  return (
    <>
      <HostIssueRow
        issues={offline.map((host) => ({
          hostName: host.name || t('Offline'),
          hostId: host.id,
          kind: 'offline',
        }))}
        labels={homeLabels()}
        onOpen={(issue) => (issue?.hostId ? connection.open(issue.hostId) : router.push('/hosts'))}
      />
      {connection.sheet}
    </>
  );
}
