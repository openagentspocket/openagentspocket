import { t } from '@openagentspocket/i18n';
import { Button, Icon, makeStyles, Text } from '@openagentspocket/ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useAuthenticator } from './SettingsProvider';
import { useAppLock } from './useAppLock';

const useStyles = makeStyles((th) => ({
  cover: {
    ...({ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const),
    backgroundColor: th.colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    gap: th.spacing.md,
    padding: th.metrics.screenInset,
  },
}));

/** Covers the app while it is in the switcher or locked, and offers the unlock prompt. */
export function AppLockCover() {
  const styles = useStyles();
  const { covered, locked, message, unlock } = useAppLock();
  const authenticator = useAuthenticator();
  const [kind, setKind] = useState<string | null>(null);

  useEffect(() => {
    authenticator.kind().then(setKind);
  }, [authenticator]);

  // Ask as soon as the lock appears, as the Swift app does at launch and on return.
  useEffect(() => {
    if (locked) unlock();
  }, [locked, unlock]);

  if (!covered) return null;
  return (
    <View style={styles.cover} testID="app-lock-cover" accessibilityViewIsModal>
      <Icon name="settings" size={32} />
      <Text variant="headline">{t('Agentico Is Locked')}</Text>
      {locked && message ? <Text testID="app-lock-message">{message}</Text> : null}
      {locked ? (
        <Button
          title={t('Unlock with %@', kind ?? t('Passcode'))}
          onPress={unlock}
          testID="app-lock-unlock"
        />
      ) : null}
    </View>
  );
}
