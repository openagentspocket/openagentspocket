import { t } from '@openagentspocket/i18n';
import { Button, Text } from '@openagentspocket/ui';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { hostsRuntime } from './hostsRuntime';

/** The comment the line carries in `authorized_keys`, as the Swift app's. */
export const DEVICE_KEY_COMMENT = 'openagentspocket';

/**
 * The Device Key's `authorized_keys` line with a Copy button (Swift `HostFormView.deviceKeySection`):
 * the way to authorize this device on a Host that was not paired by code.
 */
export function DeviceKeyLine() {
  const [line, setLine] = useState<string | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);

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
  }, []);

  if (line === undefined) return null;
  if (line === null) {
    return (
      <Text tone="danger" testID="device-key-unavailable">
        {t('Device key unavailable')}
      </Text>
    );
  }
  return (
    <>
      <Text variant="mono" selectable numberOfLines={3} testID="device-key-line">
        {line}
      </Text>
      <Button
        kind="secondary"
        icon="copy"
        title={copied ? t('Copied') : t('Copy authorized_keys Line')}
        onPress={async () => {
          await Clipboard.setStringAsync(line);
          setCopied(true);
        }}
        testID="device-key-copy"
      />
    </>
  );
}
