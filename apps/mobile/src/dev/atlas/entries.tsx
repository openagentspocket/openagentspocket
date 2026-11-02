import { t } from '@openagentspocket/i18n';
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
import { AppLockView } from '@/settings/AppLockCover';
import { deviceStorage } from '@/settings/deviceStorage';
import { LicenseNoticeScreen } from '@/settings/LicenseNoticeScreen';
import { NOTICES } from '@/settings/notices.generated';
import { SettingsScreen } from '@/settings/SettingsScreen';
import type { AtlasData } from './AtlasFrame';

export interface AtlasEntry {
  data?: AtlasData;
  render: () => ReactNode;
}

const titled = (title: string, body: ReactNode): ReactNode => (
  <>
    <Stack.Screen options={{ headerShown: true, title }} />
    {body}
  </>
);

const noop = () => {};

/** A settings sub page as it pushes inside the sheet: native header, inline title, back button. */
const settingsPage = (page: string): ReactNode => (
  <>
    <Stack.Screen options={{ headerShown: true }} />
    <SettingsScreen page={page} />
  </>
);

/**
 * Swift screen id -> the RN screen in a fixed state. Ids missing here are listed as "no RN screen
 * yet" by scripts/atlas-compare.mjs. Add the id to atlasMap.json too (a test checks both agree).
 */
export const atlasEntries: Readonly<Record<string, AtlasEntry>> = {
  'shell.home': { render: () => <Index /> },
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
  'settings.theme': { render: () => settingsPage('theme') },
  'settings.appearance': { render: () => settingsPage('fonts') },
  'settings.chat': { render: () => settingsPage('chat') },
  'settings.chat-cache': { render: () => settingsPage('chat') },
  'settings.input-toolbar': { render: () => settingsPage('toolbar') },
  'settings.acknowledgements': { render: () => settingsPage('acknowledgements') },
  'settings.license-notice': { render: () => <LicenseNoticeScreen id={NOTICES[0]?.id} /> },
  'shell.app-lock': {
    render: () => <AppLockView kind="Face ID" locked message={null} onUnlock={noop} />,
  },
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
