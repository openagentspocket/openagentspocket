import {
  formatPluginVersion,
  type Host,
  type HostNotificationSettings,
  type HostNotificationState,
  hostDisplayName,
  type NotificationPreferencesStore,
  type PluginVersion,
  pluginRequirements,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, Section, Text, ToggleRow } from '@openagentspocket/ui';
import { ActivityIndicator, View } from 'react-native';
import { renderMessage } from './renderText';

interface Props {
  host: Host;
  state: HostNotificationState | undefined;
  store: NotificationPreferencesStore;
  plugin: PluginVersion | null;
  onRetry: () => void;
}

/** What the section shows for a state that has confirmed settings, or null. */
function settingsOf(state: HostNotificationState | undefined): HostNotificationSettings | null {
  if (state?.kind === 'idle' || state?.kind === 'updating' || state?.kind === 'failed') {
    return state.settings;
  }
  return null;
}

function approvalsNote(plugin: PluginVersion | null): string | null {
  if (!plugin) return null;
  const [missing] = pluginRequirements(['approvalActions'], plugin);
  return missing
    ? t(
        'Approving from notifications needs plugin %@ or newer; this Host has %@.',
        formatPluginVersion(missing.minimum),
        formatPluginVersion(missing.installed),
      )
    : null;
}

/** One Host's notification preferences: the confirmed truth, never an optimistic flip. */
export function HostNotificationSection({ host, state, store, plugin, onRetry }: Props) {
  const settings = settingsOf(state);
  const busy = state?.kind === 'updating';
  const testID = `notifications-host-${host.id}`;
  const note = settings?.isRegistered ? approvalsNote(plugin) : null;
  const footer: string[] = [];
  if (settings?.isRegistered) {
    footer.push(
      t(
        "Approve from Notifications adds Approve and Deny to this Host's permission prompts. The prompt travels encrypted but shows on your Lock Screen, and Approve runs it on the Host. Approve needs your iPhone unlocked; Deny doesn't.",
      ),
    );
    if (note) footer.push(note);
  }
  if (state?.kind === 'failed') footer.push(renderMessage(state.message));

  return (
    <Section title={hostDisplayName(host)} footer={footer.join('\n\n')} testID={testID}>
      {!state || state.kind === 'loading' ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text tone="secondary">{t('Checking this Host')}</Text>
          <ActivityIndicator />
        </View>
      ) : null}
      {state?.kind === 'unavailable' ? (
        <View>
          <Text tone="secondary">{renderMessage(state.message)}</Text>
          <Button kind="text" title={t('Check Again')} onPress={onRetry} />
        </View>
      ) : null}
      {settings ? (
        <ToggleRow
          title={t('Notifications')}
          value={settings.isRegistered}
          disabled={busy}
          testID={`${testID}-enabled`}
          onValueChange={(on) => void store.setNotificationsEnabled(on, host)}
        />
      ) : null}
      {settings?.isRegistered ? (
        <ToggleRow
          title={t('Done Notifications')}
          value={settings.notify.done}
          disabled={busy}
          testID={`${testID}-done`}
          onValueChange={(on) => void store.setDoneEnabled(on, host)}
        />
      ) : null}
      {settings?.isRegistered ? (
        <ToggleRow
          title={t('Approve from Notifications')}
          value={settings.notify.approve}
          disabled={busy || (!settings.notify.approve && note !== null)}
          testID={`${testID}-approve`}
          onValueChange={(on) => void store.setApprovalsEnabled(on, host)}
        />
      ) : null}
    </Section>
  );
}
