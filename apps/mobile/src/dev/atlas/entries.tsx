import type { ChatBannerLine } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { confirm, Screen } from '@openagentspocket/ui';
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
import { SetupGuideScreen } from '@/features/hosts/SetupGuideScreen';
import { closeTerminalConfirmation } from '@/features/terminals/closeConfirmation';
import { SHELL_CLOSE_ANCHOR, ShellTerminalScreen } from '@/features/terminals/ShellTerminalScreen';
import { NotificationPrivacyScreen } from '@/notifications/NotificationPrivacyScreen';
import { AppLockView } from '@/settings/AppLockCover';
import { deviceStorage } from '@/settings/deviceStorage';
import { LicenseNoticeScreen } from '@/settings/LicenseNoticeScreen';
import { NOTICES } from '@/settings/notices.generated';
import { SettingsScreen } from '@/settings/SettingsScreen';
import { HostUsageSection } from '@/usage/HostUsageSection';
import { UsageBreakdownListScreen } from '@/usage/UsageBreakdownListScreen';
import { UsageScreen } from '@/usage/UsageScreen';
import type { AtlasScript } from './AtlasActions';
import type { AtlasData } from './AtlasFrame';
import { AlertOver, closePanePopover, ExplainerOpen, TerminalStatusAtlas } from './atlasOverlays';
import { atlasAccountFiles, atlasUsageSource } from './atlasUsage';
import { PluginNoticeDemo, ReplaceKeyDemo, RoutePageDemo } from './HostsDemos';
import { InAppBannerAtlas } from './InAppBannerAtlas';
import { RemoveConfirmDemo } from './RemoveConfirmDemo';

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

/** A screen that draws its own floating header (Agent detail): no route header. */
const bare = (body: ReactNode): ReactNode => (
  <>
    <Stack.Screen options={{ headerShown: false }} />
    {body}
  </>
);

const noop = () => {};
const MORE = [{ key: 'changes', title: t('Changes'), onPress: noop }];

const READ_FAILURE: ChatBannerLine = { kind: 'readFailure', failure: { kind: 'timedOut' } };
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
    render: () => <HostDetailScreen hostId="demo" onBack={noop} onEdit={noop} onRemoved={noop} />,
  },
  'hosts.trust-alert': {
    data: { trusted: false },
    render: () => <HostDetailScreen hostId="demo" onBack={noop} onEdit={noop} onRemoved={noop} />,
  },
  'hosts.setup-guide': { render: () => <SetupGuideScreen onBack={noop} /> },
  'hosts.route-page': { render: () => <RoutePageDemo /> },
  'hosts.new-route': { render: () => <RoutePageDemo isNew /> },
  'hosts.peer-picker': { render: () => <RoutePageDemo picking /> },
  'hosts.plugin-notice': {
    data: { pluginVersion: '0.5.0' },
    render: () => <PluginNoticeDemo />,
  },
  'hosts.replace-auth-key-confirm': {
    data: { deviceKey: 'unavailable' },
    render: () => <ReplaceKeyDemo />,
  },
  'hosts.remove-confirm': { render: () => <RemoveConfirmDemo /> },
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
  'usage.tab': { render: () => titled(t('Usage'), <Usage />) },
  'usage.tab--host': {
    render: () => titled(t('Usage'), <UsageScreen initial={{ host: 'demo' }} />),
  },
  'usage.scope-menu': { render: () => <UsageScreen initial={{ menu: true }} /> },
  'usage.day-sheet': { render: () => <UsageScreen initial={{ day: 'latest' }} /> },
  'usage.quick-sheet--limits-off': {
    render: () => <UsageScreen initial={{ quick: true, limitsOff: true }} />,
  },
  'usage.accounts-sheet': { render: () => <UsageScreen initial={{ accounts: true }} /> },
  'usage.accounts-notice': { render: () => <UsageScreen initial={{ host: 'demo' }} /> },
  'usage.account-rename-alert': {
    render: () => (
      <UsageScreen
        source={atlasUsageSource}
        files={atlasAccountFiles()}
        initial={{ host: 'demo', accounts: true, rename: '7f3c9a2e' }}
      />
    ),
  },
  'usage.account-remove-confirm': {
    render: () => (
      <UsageScreen
        source={atlasUsageSource}
        files={atlasAccountFiles()}
        initial={{ host: 'demo', accounts: true, remove: 'b41d07c5' }}
      />
    ),
  },
  'usage.host-section': {
    render: () => (
      <Screen testID="host-usage-screen">
        <HostUsageSection hostId="demo" onOpenUsage={noop} />
      </Screen>
    ),
  },
  'usage.hosts-section': {
    render: () => (
      <UsageScreen source={atlasUsageSource} files={atlasAccountFiles()} wide={false} />
    ),
  },
  'usage.ipad-split': {
    render: () => <UsageScreen source={atlasUsageSource} files={atlasAccountFiles()} wide />,
  },
  'usage.wide-layout': {
    render: () => (
      <UsageScreen
        source={atlasUsageSource}
        files={atlasAccountFiles()}
        initial={{ host: 'demo' }}
        wide
      />
    ),
  },
  'usage.breakdown-list': { render: () => <UsageBreakdownListScreen /> },
  'usage.breakdown-list--directories': {
    render: () => <UsageBreakdownListScreen initial={{ kind: 'directories' }} />,
  },
  'usage.limits-sheet': { render: () => <UsageLimits /> },
  'usage.limits-page': { render: () => <UsageLimits /> },
  'files.browser': { render: () => <FilesRoute /> },
  'browser.ports': { render: () => <PortsRoute /> },
  'changes.list': { render: () => <ChangesRoute /> },
  'changes.file-diff': { render: () => <FileDiffRoute /> },
  'agent-detail.container': {
    render: () =>
      bare(
        <AgentDetailScreen
          hostId="demo"
          paneId="p1"
          storage={deviceStorage}
          surface="chat"
          onSwitch={noop}
          moreItems={MORE}
        />,
      ),
  },
  'agent-detail.terminal': {
    render: () =>
      bare(
        <AgentDetailScreen
          hostId="demo"
          paneId="p1"
          storage={deviceStorage}
          surface="terminal"
          onSwitch={noop}
          moreItems={MORE}
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
  'agent-detail.shell-close-confirm': {
    render: () => (
      <AlertOver options={{ ...closeTerminalConfirmation(), anchorKey: SHELL_CLOSE_ANCHOR }}>
        {titled(
          t('Terminal'),
          <ShellTerminalScreen
            hostId="demo"
            workspaceId="w0"
            cwd="/work/api-server"
            onClose={noop}
          />,
        )}
      </AlertOver>
    ),
  },
  'agent-detail.chat-banners': {
    render: () =>
      bare(
        <AgentDetailScreen
          hostId="demo"
          paneId="p1"
          storage={deviceStorage}
          surface="chat"
          chatStatus={{ lines: [READ_FAILURE], locating: true }}
          onSwitch={noop}
          moreItems={MORE}
        />,
      ),
  },
  'agent-detail.close-confirm': {
    render: () => (
      <AlertOver options={closePanePopover}>
        {bare(
          <AgentDetailScreen
            hostId="demo"
            paneId="p1"
            storage={deviceStorage}
            surface="terminal"
            onSwitch={noop}
            moreItems={MORE}
          />,
        )}
      </AlertOver>
    ),
  },
  'shell.notification-banner': { render: () => <InAppBannerAtlas /> },
  'agent-detail.terminal-status-overlay': {
    render: () => bare(<TerminalStatusAtlas status={{ kind: 'connecting' }} />),
  },
  'settings.notification-explainer': {
    render: () => (
      <ExplainerOpen>
        <NotificationsRoute />
      </ExplainerOpen>
    ),
  },
  'rn.board': { render: () => <Board /> },
};
