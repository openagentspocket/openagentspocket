// Atlas entries of Settings and its pages (settings.*, shell.hosts-settings-sheets). Owned by its UX family task.
import { t } from '@openagentspocket/i18n';
import { confirm } from '@openagentspocket/ui';
import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import SettingsRoot from '@/app/settings';
import NotificationsRoute from '@/app/settings/notifications';
import Usage from '@/app/usage';
import { NotificationPrivacyScreen } from '@/notifications/NotificationPrivacyScreen';
import { AgentFieldsHostScreen } from '@/settings/agentFields/AgentFieldsHostScreen';
import { AgentFieldsListScreen } from '@/settings/agentFields/AgentFieldsListScreen';
import { LicenseNoticeScreen } from '@/settings/LicenseNoticeScreen';
import { NOTICES } from '@/settings/notices.generated';
import { SettingsScreen } from '@/settings/SettingsScreen';
import { titled } from './atlasHelpers';
import type { AtlasEntry } from './entries';

/** A settings sub page as it pushes inside the sheet: native header, inline title, back button. */
const settingsPage = (page: string): ReactNode => (
  <>
    <Stack.Screen options={{ headerShown: true }} />
    <SettingsScreen page={page} />
  </>
);

const fieldsHost = () => titled('', <AgentFieldsHostScreen hostId="demo" />);

export const settingsEntries: Readonly<Record<string, AtlasEntry>> = {
  'settings.root': { render: () => <SettingsRoot /> },
  'shell.hosts-settings-sheets': { render: () => <SettingsRoot /> },
  'settings.notifications': { render: () => <NotificationsRoute /> },
  'settings.notification-privacy': {
    render: () => titled(t('How notifications stay private'), <NotificationPrivacyScreen />),
  },
  'settings.theme': { render: () => settingsPage('theme') },
  'settings.terminal-theme-picker': { render: () => settingsPage('terminalTheme') },
  'settings.appearance': { render: () => settingsPage('fonts') },
  'settings.chat': { render: () => settingsPage('chat') },
  'settings.chat-cache': { render: () => settingsPage('chat') },
  'settings.chat-cache-clear-confirm': {
    script: {
      run: () =>
        void confirm({
          title: t('Clear Chat cache?'),
          message: t('Chat reloads messages from each Host the next time you open it.'),
          confirmLabel: t('Clear Cache'),
          destructive: true,
          presentation: 'dialog',
        }),
    },
    render: () => settingsPage('chat'),
  },
  'settings.input-toolbar': { render: () => settingsPage('toolbar') },
  'settings.agent-list-fields': {
    render: () => titled(t('Agent List Fields'), <AgentFieldsListScreen />),
  },
  'settings.agent-list-fields-host': { render: fieldsHost },
  'settings.agent-list-fields-add-field': {
    script: { press: ['field-add-row1'] },
    render: fieldsHost,
  },
  'settings.agent-list-fields-sync-confirm': {
    script: { press: ['fields-sync'] },
    render: fieldsHost,
  },
  'settings.agent-list-fields-reset-confirm': {
    script: { press: ['agent-fields-reset'] },
    render: () => titled(t('Agent List Fields'), <AgentFieldsListScreen unreadable />),
  },
  'settings.usage': { render: () => titled(t('Usage'), <Usage />) },
  'settings.acknowledgements': { render: () => settingsPage('acknowledgements') },
  'settings.license-notice': { render: () => <LicenseNoticeScreen id={NOTICES[0]?.id} /> },
};
