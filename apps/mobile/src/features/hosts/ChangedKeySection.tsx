import { fingerprintDisplay, type HostKeyFingerprint } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, CopyButton, Section, Text } from '@openagentspocket/ui';
import { View } from 'react-native';
import { extra } from './extraText';

/** The command that prints the key the machine really has, to compare with the new one. */
export function fingerprintCommand(presented: HostKeyFingerprint): string {
  const type = presented.algorithm.includes('ecdsa')
    ? 'ecdsa'
    : presented.algorithm.includes('rsa')
      ? 'rsa'
      : 'ed25519';
  return `ssh-keygen -lf /etc/ssh/ssh_host_${type}_key.pub`;
}

interface ChangedKeySectionProps {
  presented: HostKeyFingerprint;
  onTrust: () => void;
}

/** Under the status card when a Host presents a key other than the trusted one. */
export function ChangedKeySection({ presented, onTrust }: ChangedKeySectionProps) {
  const command = fingerprintCommand(presented);
  return (
    <Section
      title={extra('Changed host key')}
      grouped={false}
      footer={t(
        'Trust the new key only if this prints the same fingerprint. On Windows, the key is under %ProgramData%\\ssh.',
      )}
      testID="changed-key-section"
    >
      <View>
        <Text variant="caption" tone="secondary">
          {t('New key')}
        </Text>
        <Text variant="mono" selectable>
          {fingerprintDisplay(presented)}
        </Text>
      </View>
      <View>
        <Text variant="caption" tone="secondary">
          {t('On the Host, run')}
        </Text>
        <Text variant="mono" selectable>
          {command}
        </Text>
      </View>
      <CopyButton value={command} title={t('Copy Command')} />
      <Button
        kind="destructive"
        icon="warning"
        title={t('Trust New Host Key')}
        onPress={onTrust}
        testID="trust-new-key"
      />
    </Section>
  );
}
