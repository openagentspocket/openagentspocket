import { t } from '@openagentspocket/i18n';
import { confirm } from '@openagentspocket/ui';
import type { ReactNode } from 'react';
import Agents from '@/app/agents';
import Board from '@/app/board';
import HostsRoute from '@/app/hosts';
import HostFormRoute from '@/app/hosts/form';
import PairRoute from '@/app/hosts/pair';
import Index from '@/app/index';
import Usage from '@/app/usage';
import UsageLimits from '@/app/usage-limits';
import { HostDetailScreen } from '@/features/hosts/HostDetailScreen';
import { SetupGuideScreen } from '@/features/hosts/SetupGuideScreen';
import { AppScreen } from '@/navigation/AppScreen';
import { AppLockView } from '@/settings/AppLockCover';
import { HostUsageSection } from '@/usage/HostUsageSection';
import { UsageBreakdownListScreen } from '@/usage/UsageBreakdownListScreen';
import { UsageScreen } from '@/usage/UsageScreen';
import type { AtlasScript } from './AtlasActions';
import type { AtlasData } from './AtlasFrame';
import { noop, titled } from './atlasHelpers';
import { atlasAccountFiles, atlasUsageSource } from './atlasUsage';
import { agentDetailEntries } from './familyAgentDetail';
import { consoleEntries } from './familyConsole';
import { filesEntries } from './familyFiles';
import { hostsEntries } from './familyHosts';
import { newAgentEntries } from './familyNewAgent';
import { notificationEntries } from './familyNotifications';
import { settingsEntries } from './familySettings';
import { PluginNoticeDemo, ReplaceKeyDemo, RoutePageDemo } from './HostsDemos';
import { RemoveConfirmDemo } from './RemoveConfirmDemo';

export interface AtlasEntry {
  data?: AtlasData;
  script?: AtlasScript;
  render: () => ReactNode;
}

export const atlasEntries: Readonly<Record<string, AtlasEntry>> = {
  ...agentDetailEntries,
  ...consoleEntries,
  ...filesEntries,
  ...hostsEntries,
  ...newAgentEntries,
  ...notificationEntries,
  ...settingsEntries,
  'shell.home': { render: () => <Index /> },
  'shell.home-new-menu': { script: { press: ['fab'] }, render: () => <Index /> },
  'shell.home-host-menu': { script: { press: ['home-host-scope'] }, render: () => <Index /> },
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
  'console.agents-list-by-status': { data: { presentation: 'byStatus' }, render: () => <Agents /> },
  'console.agents-list-by-workspace': {
    data: { presentation: 'byWorkspace' },
    render: () => <Agents />,
  },
  'console.agents-list-by-host': { data: { presentation: 'byHost' }, render: () => <Agents /> },
  'console.quick-detail-sheet': {
    data: { presentation: 'byStatus' },
    render: () => <Agents openDetail="p2" />,
  },
  'console.empty-states-agents': { data: { console: 'empty' }, render: () => <Agents /> },
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
        initial={{ host: 'demo', accounts: true, remove: '7f3c9a2e' }}
      />
    ),
  },
  'usage.host-section': {
    render: () => (
      <AppScreen header={{ variant: 'native', title: t('Usage') }} testID="host-usage-screen">
        <HostUsageSection hostId="demo" onOpenUsage={noop} />
      </AppScreen>
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
  'rn.board': { render: () => <Board /> },
};
