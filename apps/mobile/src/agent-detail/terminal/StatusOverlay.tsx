import type { AttachStatus } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, makeStyles, Text } from '@openagentspocket/ui';
import { View } from 'react-native';
import { renderMessage } from '@/lib/renderText';

const useStyles = makeStyles((th) => ({
  overlay: {
    position: 'absolute',
    top: th.spacing.sm,
    alignSelf: 'center',
    alignItems: 'center',
    gap: th.spacing.xs,
    paddingHorizontal: th.spacing.md,
    paddingVertical: th.spacing.sm,
    borderRadius: th.metrics.cardRadius,
    backgroundColor: th.colors.surfaceOverlay,
    borderWidth: th.metrics.hairlineWidth,
    borderColor: th.hairline,
  },
}));

/** What the terminal says about its connection, over the screen; nothing while live. */
export function StatusOverlay({ status, onRetry }: { status: AttachStatus; onRetry: () => void }) {
  const styles = useStyles();
  if (status.kind === 'live' || status.kind === 'stopped') return null;
  return (
    <View style={styles.overlay} pointerEvents="box-none" testID="terminal-status">
      <Text variant="callout" tone="secondary" accessibilityLiveRegion="polite">
        {status.kind === 'ended'
          ? renderMessage(status.message)
          : status.kind === 'reconnecting'
            ? t('Reconnecting…')
            : t('Connecting…')}
      </Text>
      {status.kind === 'ended' ? (
        <Button title={t('Retry')} kind="secondary" onPress={onRetry} testID="terminal-retry" />
      ) : null}
    </View>
  );
}
