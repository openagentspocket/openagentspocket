import { View } from 'react-native';
import type { Tone } from '../theme/status';
import { makeStyles, useTheme } from '../theme/theme';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

const TONE_ICON: Record<Tone, IconName> = {
  accent: 'sparkles',
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'error',
  neutral: 'info',
};

const useStyles = makeStyles((t) => ({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: t.spacing.sm,
    borderRadius: t.metrics.cardRadius,
    paddingVertical: t.spacing.sm,
    paddingLeft: t.spacing.md,
    paddingRight: t.spacing.xs,
  },
  icon: { paddingTop: 2 },
  text: { flex: 1, gap: 2, paddingRight: t.spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: -t.spacing.xs },
}));

interface BannerProps {
  title: string;
  message?: string;
  tone?: Tone;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
  /** Shows a close button. */
  onDismiss?: () => void;
  dismissLabel?: string;
  testID?: string;
}

/** An inline notice with an optional action: chat banners, plugin notice, Host issues, drift. */
export function Banner({
  title,
  message,
  tone = 'info',
  icon,
  actionLabel,
  onAction,
  onDismiss,
  dismissLabel = 'Dismiss',
  testID = 'banner',
}: BannerProps) {
  const styles = useStyles();
  const theme = useTheme();
  const ink = theme.tone(tone);
  return (
    <View style={[styles.banner, { backgroundColor: theme.wash(ink) }]} testID={testID}>
      <View style={styles.icon}>
        <Icon name={icon ?? TONE_ICON[tone]} tint={ink} />
      </View>
      <View style={styles.text} accessible accessibilityRole={tone === 'danger' ? 'alert' : 'text'}>
        <Text variant="headline">{title}</Text>
        {message ? (
          <Text variant="callout" tone="secondary">
            {message}
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        {actionLabel && onAction ? (
          <Button kind="text" size="small" title={actionLabel} onPress={onAction} />
        ) : null}
        {onDismiss ? (
          <Button
            kind="text"
            size="small"
            icon="close"
            accessibilityLabel={dismissLabel}
            onPress={onDismiss}
            testID={`${testID}-dismiss`}
          />
        ) : null}
      </View>
    </View>
  );
}
