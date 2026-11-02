import { t } from '@openagentspocket/i18n';
import { confirm } from '@openagentspocket/ui';
import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { AgentDetailScreen } from '@/agent-detail/AgentDetailScreen';
import Agents from '@/app/agents';
import Board from '@/app/board';
import ChangesRoute from '@/app/changes';
import FileDiffRoute from '@/app/changes/diff';
import FilesRoute from '@/app/files';
import HostsRoute from '@/app/hosts';
import HostFormRoute from '@/app/hosts/form';
import PairRoute from '@/app/hosts/pair';
import Index from '@/app/index';
import NewAgentRoute from '@/app/new-agent';
import PortsRoute from '@/app/ports';
import SettingsRoot from '@/app/settings';
import NotificationsRoute from '@/app/settings/notifications';
import Usage from '@/app/usage';
import UsageLimits from '@/app/usage-limits';
import { HostDetailScreen } from '@/features/hosts/HostDetailScreen';
import { ShellTerminalScreen } from '@/features/terminals/ShellTerminalScreen';
import { NotificationPrivacyScreen } from '@/notifications/NotificationPrivacyScreen';
import { deviceStorage } from '@/settings/deviceStorage';
import { LicenseNoticeScreen } from '@/settings/LicenseNoticeScreen';
import type { AtlasScript } from './AtlasActions';
import type { AtlasData } from './AtlasFrame';

export interface AtlasEntry {
  data?: AtlasData;
  script?: AtlasScript;
  render: () => ReactNode;
}

const titled = (title: string, body: ReactNode): ReactNode => (
  <>
    <Stack.Screen options={{ headerShown: true, title }} />
    {body}
  </>
);

const noop = () => {};

/**
 * Swift screen id -> the RN screen in a fixed state. Ids missing here are listed as "no RN screen
 * yet" by scripts/atlas-compare.mjs. Add the id to atlasMap.json too (a test checks both agree).
 */
export const atlasEntries: Readonly<Record<string, AtlasEntry>> = {
  'shell.home': { render: () => <Index /> },
  'shell.home-new-menu': { script: { press: ['fab'] }, render: () => <Index /> },
  'console.row-context-menu': { script: { longPress: 'inbox-p2' }, render: () => <Index /> },
  'console.close-confirmation': {
    script: {
      run: () =>
        void confirm({
          title: t('Close %@?', 'Migration'),
          confirmLabel: t('Close'),
          destructive: true,
        }),
    },
    render: () => <Index />,
  },
  'console.host-issue-rows': { data: { console: 'offline' }, render: () => <Index /> },
  'usage.quick-sheet': { script: { press: ['home-usage-ring'] }, render: () => <Index /> },
  'console.no-hosts-empty': { data: { console: 'empty', hosts: 'empty' }, render: () => <Index /> },
  'console.agents-list-flat': { render: () => <Agents /> },
  'console.start-agent': { render: () => titled(t('New Agent'), <NewAgentRoute />) },
  'hosts.list': { render: () => <HostsRoute /> },
  'hosts.form': { render: () => <HostFormRoute /> },
  'hosts.detail': {
    render: () =>
      titled(t('Host Details'), <HostDetailScreen hostId="demo" onEdit={noop} onRemoved={noop} />),
  },
  'hosts.pairing-scanner': { render: () => <PairRoute /> },
  'settings.root': { render: () => <SettingsRoot /> },
  'settings.notifications': { render: () => <NotificationsRoute /> },
  'settings.notification-privacy': {
    render: () => titled(t('How notifications stay private'), <NotificationPrivacyScreen />),
  },
  'settings.acknowledgements': { render: () => <LicenseNoticeScreen /> },
  'usage.tab': { render: () => <Usage /> },
  'usage.limits-page': { render: () => <UsageLimits /> },
  'files.browser': { render: () => <FilesRoute /> },
  'browser.ports': { render: () => <PortsRoute /> },
  'changes.list': { render: () => <ChangesRoute /> },
  'changes.file-diff': { render: () => <FileDiffRoute /> },
  'agent-detail.container': {
    render: () =>
      titled(
        '',
        <AgentDetailScreen
          hostId="demo"
          paneId="p1"
          storage={deviceStorage}
          surface="chat"
          onSwitch={noop}
        />,
      ),
  },
  'agent-detail.terminal': {
    render: () =>
      titled(
        '',
        <AgentDetailScreen
          hostId="demo"
          paneId="p1"
          storage={deviceStorage}
          surface="terminal"
          onSwitch={noop}
        />,
      ),
  },
  'agent-detail.shell-terminal': {
    render: () =>
      titled(
        t('Terminal'),
        <ShellTerminalScreen
          hostId="demo"
          workspaceId="w0"
          cwd="/work/api-server"
          onClose={noop}
        />,
      ),
  },
  'rn.board': { render: () => <Board /> },
};
