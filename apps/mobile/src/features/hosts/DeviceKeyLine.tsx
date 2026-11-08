import { t } from '@openagentspocket/i18n';
import { airy, Button, confirm, Icon, spacing, Text } from '@openagentspocket/ui';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { hostsRuntime } from './hostsRuntime';

/** The comment the line carries in `authorized_keys`, as the Swift app's. */
export const DEVICE_KEY_COMMENT = 'openagentspocket';

/** hosts.replace-auth-key-confirm: the dialog that guards replacing this device's key. */
export function askReplaceDeviceKey(): Promise<boolean> {
  return confirm({
    title: t('Replace the Device Key?'),
    message: t('Replace it and register the new public key on every Host that uses it.'),
    confirmLabel: t('Replace Device Key'),
    destructive: true,
    presentation: 'dialog',
  });
}

/**
 * The Device Key's `authorized_keys` line with a Copy button (Swift `HostFormView.deviceKeySection`):
 * the way to authorize this device on a Host that was not paired by code.
 */
export function DeviceKeyLine() {
  const [line, setLine] = useState<string | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` reloads the key (Try Again)
  useEffect(() => {
    let live = true;
    hostsRuntime()
      .loadDeviceKey()
      .then(
        (load) => live && setLine(load.ok ? load.key.authorizedKeysLine(DEVICE_KEY_COMMENT) : null),
      );
    return () => {
      live = false;
    };
  }, [attempt]);

  const replace = useCallback(async () => {
    const { replaceDeviceKey } = hostsRuntime();
    if (!replaceDeviceKey) return;
    const sure = await askReplaceDeviceKey();
    if (!sure) return;
    try {
      await replaceDeviceKey();
      setLine(undefined);
      setAttempt((count) => count + 1);
    } catch {
      await confirm({
        title: t('Could not replace the Device Key'),
        cancelLabel: null,
        confirmLabel: t('OK'),
      });
    }
  }, []);

  if (line === undefined) return null;
  if (line === null) {
    return (
      <View style={{ padding: spacing.sm, gap: airy.stack }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: airy.stack }}>
          <Icon name="warning" size={18} color="danger" />
          <Text tone="danger" testID="device-key-unavailable">
            {t('Device key unavailable')}
          </Text>
        </View>
        <Button
          kind="text"
          title={t('Try Again')}
          onPress={() => setAttempt((count) => count + 1)}
          testID="device-key-retry"
        />
        {hostsRuntime().replaceDeviceKey ? (
          <Button
            kind="text"
            icon="refresh"
            title={t('Replace Device Key')}
            onPress={() => void replace()}
            testID="device-key-replace"
          />
        ) : null}
      </View>
    );
  }
  return (
    <View style={{ padding: spacing.sm, gap: airy.stack }}>
      <Text variant="mono" selectable numberOfLines={3} testID="device-key-line">
        {line}
      </Text>
      <Button
        kind="text"
        icon="copy"
        title={copied ? t('Copied') : t('Copy authorized_keys Line')}
        onPress={async () => {
          await Clipboard.setStringAsync(line);
          setCopied(true);
        }}
        testID="device-key-copy"
      />
    </View>
  );
}
