import { t } from '@openagentspocket/i18n';
import { Button, Icon, makeStyles, Text } from '@openagentspocket/ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useAppLockState } from './AppLockProvider';
import { useAuthenticator } from './SettingsProvider';

const useStyles = makeStyles((th) => ({
  cover: {
    ...({ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const),
    backgroundColor: th.colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    gap: th.spacing.md,
    padding: th.metrics.screenInset * 2,
  },
  title: { textAlign: 'center' },
  body: { textAlign: 'center' },
  unlock: { marginTop: th.spacing.sm },
}));

interface AppLockViewProps {
  /** "Face ID", "Touch ID" or "Passcode". */
  kind: string;
  /** Shown while the lock is up (not while only covering the app switcher). */
  locked: boolean;
  message?: string | null;
  onUnlock: () => void;
}

/** The full-screen lock canvas (Swift `shell.app-lock`): glyph, title, what to do, and Unlock. */
export function AppLockView({ kind, locked, message, onUnlock }: AppLockViewProps) {
  const styles = useStyles();
  return (
    <View style={styles.cover} testID="app-lock-cover" accessibilityViewIsModal>
      <Icon name={kind === 'Passcode' ? 'lock' : 'faceId'} size={56} color="accent" />
      <Text variant="title2" semibold style={styles.title}>
        {t('Agentico Is Locked')}
      </Text>
      <Text tone="secondary" style={styles.body}>
        {t('Agentico is locked. Unlock with %@ to see your Agents.', kind)}
      </Text>
      {locked && message ? <Text testID="app-lock-message">{message}</Text> : null}
      {locked ? (
        <View style={styles.unlock}>
          <Button title={t('Unlock with %@', kind)} onPress={onUnlock} testID="app-lock-unlock" />
        </View>
      ) : null}
    </View>
  );
}

/** Covers the app while it is in the switcher or locked, and offers the unlock prompt. */
export function AppLockCover() {
  const { covered, locked, message, unlock } = useAppLockState();
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
    <AppLockView kind={kind ?? t('Passcode')} locked={locked} message={message} onUnlock={unlock} />
  );
}
