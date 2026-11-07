import type { AttachStatus } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, Card, makeStyles, Spinner, Text, withAlpha } from '@openagentspocket/ui';
import { View } from 'react-native';
import { renderMessage } from '@/lib/renderText';

const useStyles = makeStyles((th) => ({
  // Swift TerminalStatusDialog: a centered card, 320 pt at most; the scrim only when ended.
  layer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: th.spacing.lg,
  },
  scrim: { backgroundColor: withAlpha(th.colors.canvas, 0.45) },
  card: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    gap: th.spacing.sm,
    padding: th.spacing.lg,
  },
}));

/** What the terminal says about its connection, over the screen; nothing while live. */
export function StatusOverlay({ status, onRetry }: { status: AttachStatus; onRetry: () => void }) {
  const styles = useStyles();
  if (status.kind === 'live' || status.kind === 'stopped') return null;
  const ended = status.kind === 'ended';
  return (
    <View
      style={[styles.layer, ended && styles.scrim]}
      pointerEvents="box-none"
      testID="terminal-status"
    >
      <Card level="overlay" style={styles.card}>
        {ended ? null : <Spinner size="large" />}
        <Text variant="headline" accessibilityLiveRegion="polite" style={{ textAlign: 'center' }}>
          {ended
            ? renderMessage(status.message)
            : status.kind === 'reconnecting'
              ? t('Reconnecting…')
              : t('Connecting…')}
        </Text>
        {ended ? (
          <Button title={t('Retry')} kind="secondary" onPress={onRetry} testID="terminal-retry" />
        ) : null}
      </Card>
    </View>
  );
}
