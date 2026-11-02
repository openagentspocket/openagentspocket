import { t } from '@openagentspocket/i18n';
import { Button, Icon, Sheet, spacing, Text } from '@openagentspocket/ui';
import { Linking, View } from 'react-native';

/**
 * The GitHub-hosted PRIVACY.md the disclosure links to. Null until the port's public repository
 * exists (parity spec, known gaps); the link hides while it is null.
 */
export const NOTIFICATION_PRIVACY_URL: string | null = null;

function PrivacyLink({ label }: { label: string }) {
  if (NOTIFICATION_PRIVACY_URL === null) return null;
  return (
    <Button kind="text" title={label} onPress={() => Linking.openURL(NOTIFICATION_PRIVACY_URL)} />
  );
}

function DisclosureList({ title, icon, items }: { title: string; icon: 'info'; items: string[] }) {
  return (
    <View style={{ gap: spacing.xs }} accessibilityRole="summary">
      <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
        <Icon name={icon} />
        <Text variant="headline" accessibilityRole="header">
          {title}
        </Text>
      </View>
      {items.map((item) => (
        <Text key={item} variant="callout">
          {`• ${item}`}
        </Text>
      ))}
    </View>
  );
}

/**
 * The shared trust story: summary, what the push relay sees, what it cannot, and the custom-relay
 * caveat. One layout drives both the pre-permission explainer and the persistent disclosure so
 * the two cannot drift.
 */
export function NotificationDisclosure() {
  return (
    <View style={{ gap: spacing.lg }} testID="notification-disclosure">
      <Text>
        {t(
          'Agent Notifications travel through a push relay: your Host encrypts each notification and the relay forwards it to Apple without ever holding the key to read it.',
        )}
      </Text>
      <DisclosureList
        title={t('What the push relay sees')}
        icon="info"
        items={[
          t("Your device's Apple push token, so Apple knows which device to notify."),
          t('The encrypted notification (ciphertext), which it forwards without decrypting.'),
          t("Your Host's source IP address, as with any network request."),
          t('When and how often your Host sends notification requests.'),
          t(
            'For Live Activities: aggregate status counts, the update or end event, priority, and event timing required by Apple.',
          ),
        ]}
      />
      <DisclosureList
        title={t('What it cannot see')}
        icon="info"
        items={[
          t(
            'The identifying notification details: project name, task title, agent type and name, Host name, pane ID, and per-agent details.',
          ),
          t(
            'The relay cannot decrypt this content because it never receives your Notification Key.',
          ),
        ]}
      />
      <Text variant="caption" tone="secondary">
        {t(
          "A custom relay must use APNs credentials authorized for this app's bundle ID, or Apple rejects every notification it forwards.",
        )}
      </Text>
    </View>
  );
}

/** The persistent disclosure body, with the link out to PRIVACY.md. */
export function NotificationPrivacyContent() {
  return (
    <View style={{ gap: spacing.md }}>
      <NotificationDisclosure />
      <PrivacyLink label={t('Read PRIVACY.md')} />
    </View>
  );
}

interface ExplainerProps {
  visible: boolean;
  onClose: () => void;
  /** Triggers the real permission request; dismissing leaves the permission untouched. */
  onContinue: () => void;
}

/** The pre-permission explainer, shown before the OS prompt (disclosure gate). */
export function NotificationExplainerSheet({ visible, onClose, onContinue }: ExplainerProps) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('Before you turn on notifications')}
      testID="notification-explainer"
      footer={
        <View style={{ gap: spacing.xs }}>
          <PrivacyLink label={t('Read the privacy details')} />
          <Button
            title={t('Continue')}
            testID="notification-explainer-continue"
            onPress={() => {
              onContinue();
              onClose();
            }}
          />
          <Button kind="text" title={t('Not Now')} onPress={onClose} />
        </View>
      }
    >
      <NotificationDisclosure />
    </Sheet>
  );
}
