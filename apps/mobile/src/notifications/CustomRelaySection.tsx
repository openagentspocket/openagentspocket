import { DEFAULT_RELAY_BASE_URL, type NotificationRelaySettings } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Section, TextField } from '@openagentspocket/ui';

interface Props {
  relay: NotificationRelaySettings;
  /** The field's text; re-render source, since `relay` itself is mutable. */
  value: string;
}

/**
 * The self-builder's Custom Push Relay override. Blank leaves every Host's plugin config alone
 * and uses the default relay; the last section on purpose, most people never touch it.
 */
export function CustomRelaySection({ relay, value }: Props) {
  const warning = relay.hasInsecureHTTPEntry
    ? t(
        'HTTP exposes the device token and notification metadata. Use HTTPS except for local development.',
      )
    : undefined;
  return (
    <Section
      title={t('Custom Push Relay')}
      footer={t(
        "A custom relay must use APNs credentials authorized for this app's bundle ID, or Apple rejects every notification it forwards.",
      )}
      testID="notifications-custom-relay"
    >
      <TextField
        label={t('Custom Push Relay')}
        placeholder={DEFAULT_RELAY_BASE_URL}
        value={value}
        onChangeText={(text) => {
          relay.rawValue = text;
        }}
        error={relay.hasInvalidEntry ? t('Enter a valid HTTP or HTTPS URL.') : undefined}
        hint={warning}
        mono
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        testID="notifications-relay-field"
      />
    </Section>
  );
}
