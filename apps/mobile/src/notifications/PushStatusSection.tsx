import type { PushRegistrationState } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Badge, Button, Icon, Section, spacing, Text } from '@openagentspocket/ui';
import type { ReactNode } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';

interface Props {
  push: PushRegistrationState;
  onEnable: () => void;
}

function Row({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>{children}</View>
  );
}

function StatusRow({ push, onEnable }: Props) {
  switch (push.kind) {
    case 'unknown':
      return (
        <Row>
          <Text tone="secondary">{t('Checking notification status')}</Text>
          <ActivityIndicator />
        </Row>
      );
    case 'needsPermission':
      return (
        <Button
          kind="text"
          title={t('Enable Notifications')}
          testID="notifications-enable"
          onPress={onEnable}
        />
      );
    case 'waitingForToken':
      return (
        <Row>
          <Text>{t('Registering with Apple')}</Text>
          <ActivityIndicator />
        </Row>
      );
    case 'registered':
      return (
        <Row>
          <Text>{t('Ready to configure Host notifications')}</Text>
          {push.token.env === 'sandbox' ? <Badge label={t('Sandbox')} kind="control" /> : null}
          <Icon name="success" color="success" />
        </Row>
      );
    case 'denied':
      return (
        <View>
          <Text>{t('Notifications are turned off for Agentico.')}</Text>
          <Button
            kind="text"
            title={t('Open Agentico Settings')}
            onPress={() => void Linking.openSettings()}
          />
        </View>
      );
    case 'failed':
      return (
        <View>
          <Text tone="secondary">
            {t('Could not register for push notifications. %@', push.message)}
          </Text>
          <Button kind="text" title={t('Try Again')} onPress={onEnable} />
        </View>
      );
  }
}

/** Where push permission and the device token stand; the per-Host rows depend on it. */
export function PushStatusSection(props: Props) {
  return (
    <Section
      title={t('Agent Notifications')}
      footer={t('Get notified when an Agent is waiting for your input or finishes.')}
      testID="notifications-push-status"
    >
      <StatusRow {...props} />
    </Section>
  );
}
