import { useRef } from 'react';
import { ActivityIndicator, PanResponder, Pressable, View } from 'react-native';
import { GlassCapsule } from '../primitives/GlassCapsule';
import { Icon, type IconName } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import type { Tone } from '../theme/status';
import { makeStyles, useTheme } from '../theme/theme';

/** Upward travel (points) of a swipe that dismisses the in-app banner. */
export const DISMISS_SWIPE = 24;

const useStyles = makeStyles((t) => ({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    minHeight: t.metrics.minTapSize + 8,
    paddingVertical: t.spacing.xs + 2,
    paddingHorizontal: t.spacing.md,
    borderRadius: 16,
    backgroundColor: t.colors.surfaceRaised,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
  },
  message: { flex: 1 },
  action: { minHeight: 32, justifyContent: 'center', paddingLeft: t.spacing.xs },
  locating: { alignItems: 'center', gap: t.spacing.sm, paddingVertical: t.spacing.xl },
  inapp: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: t.metrics.minTapSize + 8,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    gap: t.spacing.sm,
  },
  inappText: { flex: 1, gap: 2 },
}));

interface Action {
  label: string;
  onPress: () => void;
}

interface NoticeBannerProps {
  /** `inline` is the chat banner, `locating` the centered wait, `inapp` the top-of-screen alert. */
  kind?: 'inline' | 'locating' | 'inapp';
  tone?: Tone;
  icon?: IconName;
  message: string;
  /** Bold first line of an in-app banner (the agent's name). */
  title?: string;
  action?: Action;
  /** In-app: tap opens the agent. */
  onPress?: () => void;
  /** In-app: a swipe up, or the accessibility action, dismisses. */
  onDismiss?: () => void;
  dismissLabel?: string;
  testID?: string;
}

function Inapp({
  title,
  message,
  icon = 'bell',
  tone = 'accent',
  onPress,
  onDismiss,
  dismissLabel = 'Dismiss',
  testID,
}: NoticeBannerProps) {
  const styles = useStyles();
  const theme = useTheme();
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy < -6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_e, g) => {
        if (g.dy < -DISMISS_SWIPE) onDismiss?.();
      },
    }),
  ).current;
  return (
    <View {...swipe.panHandlers} testID={testID}>
      <GlassCapsule style={{ borderRadius: 24 }}>
        <Pressable
          style={styles.inapp}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={title ? `${title}. ${message}` : message}
          accessibilityActions={onDismiss ? [{ name: 'dismiss', label: dismissLabel }] : undefined}
          onAccessibilityAction={() => onDismiss?.()}
        >
          <Icon name={icon} tint={theme.tone(tone)} />
          <View style={styles.inappText}>
            {title ? (
              <Text variant="subheadline" semibold numberOfLines={1}>
                {title}
              </Text>
            ) : null}
            <Text variant="footnote" tone="secondary" numberOfLines={2}>
              {message}
            </Text>
          </View>
        </Pressable>
      </GlassCapsule>
    </View>
  );
}

/**
 * Notices that are not a Banner: the in-chat error row with Retry, the centered "Looking for the
 * conversation..." wait, and the top-of-screen in-app notification.
 */
export function NoticeBanner(props: NoticeBannerProps) {
  const { kind = 'inline', tone = 'warning', icon = 'warning', message, action, testID } = props;
  const styles = useStyles();
  const theme = useTheme();
  if (kind === 'locating') {
    return (
      <View
        style={styles.locating}
        accessibilityRole="progressbar"
        accessibilityLabel={message}
        testID={testID ?? 'notice-locating'}
      >
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text variant="body" tone="secondary">
          {message}
        </Text>
      </View>
    );
  }
  if (kind === 'inapp') return <Inapp {...props} testID={testID ?? 'notice-inapp'} />;
  return (
    <View
      style={styles.banner}
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      testID={testID ?? 'notice-banner'}
    >
      <Icon name={icon} tint={theme.tone(tone)} />
      <Text variant="subheadline" tone="secondary" style={styles.message}>
        {message}
      </Text>
      {action ? (
        <Pressable
          style={styles.action}
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          hitSlop={8}
          testID="notice-action"
        >
          <Text variant="subheadline" tone="accent" semibold>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
