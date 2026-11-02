import { type ReactNode, useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, PanResponder, Pressable, View } from 'react-native';
import { quick, useReducedMotion } from '../motion';
import { Icon, type IconName } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import type { Tone } from '../theme/status';
import { makeStyles, useTheme } from '../theme/theme';

/** Swift `AgentNotificationBannerView`: system-banner width, 14 pt corners. */
export const INAPP_MAX_WIDTH = 520;
const INAPP_RADIUS = 14;
/** Slide distance (points) of the entrance and exit. */
const SLIDE = 16;

/** Upward travel (points) of a swipe that dismisses the in-app banner. */
export const DISMISS_SWIPE = 24;

const useStyles = makeStyles((t) => ({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    minHeight: t.metrics.minTapSize,
    paddingVertical: t.spacing.xs,
    paddingHorizontal: t.spacing.sm,
    borderRadius: t.metrics.cardRadius + 4,
    backgroundColor: t.colors.surfaceRaised,
  },
  message: { flex: 1 },
  action: { minHeight: 32, justifyContent: 'center', paddingLeft: t.spacing.xs },
  locating: { alignItems: 'center', gap: t.spacing.sm, paddingVertical: t.spacing.xl },
  inappPin: { width: '100%', maxWidth: INAPP_MAX_WIDTH, alignSelf: 'center' },
  inapp: {
    minHeight: t.metrics.minTapSize,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    gap: t.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: INAPP_RADIUS,
    backgroundColor: t.colors.surfaceOverlay,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    shadowColor: t.colors.canvas,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
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
  /** In-app: a blocked Agent's captured question; three monospaced lines replace the message. */
  question?: string;
  /** In-app: a mark in place of the icon (the Agent's program). */
  leading?: ReactNode;
  /** In-app: false plays the exit (slide up and fade) and then calls `onExited`. */
  visible?: boolean;
  /** In-app: false jumps to the end state (the atlas pins its clock, which stalls timings). Default true. */
  animated?: boolean;
  onExited?: () => void;
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
  question,
  leading,
  icon = 'bell',
  tone = 'accent',
  visible = true,
  animated = true,
  onExited,
  onPress,
  onDismiss,
  dismissLabel = 'Dismiss',
  testID,
}: NoticeBannerProps) {
  const styles = useStyles();
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  // 0 = hidden above the edge, 1 = in place: one value drives the slide and the fade.
  const appear = useRef(new Animated.Value(0)).current;
  const exited = useRef(onExited);
  exited.current = onExited;
  useEffect(() => {
    if (!animated) {
      appear.setValue(visible ? 1 : 0);
      if (!visible) exited.current?.();
      return;
    }
    const run = quick(appear, visible ? 1 : 0, reduceMotion, 'overlay');
    // A later run on the same value supersedes this one; no cleanup stop (it wedged web's driver).
    run.start(({ finished }) => {
      if (finished && !visible) exited.current?.();
    });
  }, [visible, reduceMotion, animated, appear]);
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy < -6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_e, g) => {
        if (g.dy < -DISMISS_SWIPE) onDismiss?.();
      },
    }),
  ).current;
  const body = question ?? message;
  return (
    <Animated.View
      {...swipe.panHandlers}
      style={[
        styles.inappPin,
        {
          opacity: appear,
          transform: [
            { translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [-SLIDE, 0] }) },
          ],
        },
      ]}
    >
      <Pressable
        testID={testID}
        style={styles.inapp}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={title ? `${title}. ${body}` : body}
        accessibilityActions={onDismiss ? [{ name: 'dismiss', label: dismissLabel }] : undefined}
        onAccessibilityAction={() => onDismiss?.()}
      >
        {leading ?? <Icon name={icon} tint={theme.tone(tone)} />}
        <View style={styles.inappText}>
          {title ? (
            <Text variant="subheadline" semibold numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {question ? (
            <Text
              variant="footnote"
              monospaced
              tone="secondary"
              numberOfLines={3}
              testID="notice-inapp-question"
            >
              {question}
            </Text>
          ) : (
            <Text variant="footnote" tone="secondary" numberOfLines={2}>
              {message}
            </Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
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
