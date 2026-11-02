import { t } from '@openagentspocket/i18n';
import { NavRow, Screen, Section } from '@openagentspocket/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { CustomRelaySection } from './CustomRelaySection';
import { HostNotificationSection } from './HostNotificationSection';
import { NotificationExplainerSheet } from './NotificationDisclosure';
import { PushStatusSection } from './PushStatusSection';
import { useNotificationSettings } from './useNotificationSettings';

/**
 * Notification settings: push registration, per-Host delivery preferences, the privacy
 * disclosure and the self-builder relay override. The OS permission prompt only fires after the
 * user reads the explainer and taps Continue.
 */
export function NotificationSettingsScreen() {
  const router = useRouter();
  const { store, relay, relayText, states, push, enable, refresh, pluginVersionOf } =
    useNotificationSettings();
  const [explaining, setExplaining] = useState(false);

  return (
    <Screen testID="settings-notifications">
      <PushStatusSection push={push} onEnable={() => setExplaining(true)} />
      {push.kind === 'registered'
        ? store.hosts.map((host) => (
            <HostNotificationSection
              key={host.id}
              host={host}
              state={states.get(host.id)}
              store={store}
              plugin={pluginVersionOf(host.id)}
              onRetry={refresh}
            />
          ))
        : null}
      <Section
        title={t('Privacy')}
        footer={t(
          'Agent Notifications travel through a push relay: your Host encrypts each notification and the relay forwards it to Apple without ever holding the key to read it.',
        )}
      >
        <NavRow
          title={t('How notifications stay private')}
          testID="notifications-privacy-link"
          onPress={() => router.push('/settings/notification-privacy')}
        />
      </Section>
      <CustomRelaySection relay={relay} value={relayText} />
      <NotificationExplainerSheet
        visible={explaining}
        onClose={() => setExplaining(false)}
        onContinue={() => void enable()}
      />
    </Screen>
  );
}
