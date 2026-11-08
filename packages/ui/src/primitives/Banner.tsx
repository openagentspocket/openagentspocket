import { type ReactNode, useEffect, useRef } from 'react';
import { Animated, PanResponder, Platform, View } from 'react-native';
import { quick, useReducedMotion } from '../motion';
import { airy } from '../theme/metrics';
import type { Tone } from '../theme/status';
import { makeStyles, useTheme } from '../theme/theme';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Tappable } from './Tappable';
import { Text } from './Text';

const TONE_ICON: Record<Tone, IconName> = {
  accent: 'sparkles',
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'error',
  neutral: 'info',
};

/** Swift `AgentNotificationBannerView`: system-banner width, 14 pt corners. */
const INAPP_MAX_WIDTH = 520;
const FLOATING_RADIUS = 14;
/** Slide distance (points) of the floating banner's entrance and exit. */
const SLIDE = 16;
/** Upward travel (points) of a swipe that dismisses the floating banner. */
const DISMISS_SWIPE = 24;

/** wash: the inline notice on its tone's wash. row: the tight chat row. floating: the in-app alert. */
export type BannerLook = 'wash' | 'row' | 'floating';

const useStyles = makeStyles((t) => ({
  base: { flexDirection: 'row', alignItems: 'center' },
  wash: {
    alignItems: 'flex-start',
    gap: t.spacing.sm,
    borderRadius: t.metrics.cardRadius,
    paddingVertical: t.spacing.sm,
    paddingLeft: t.spacing.md,
    paddingRight: t.spacing.xs,
  },
  // Tight like Swift's chat banner: its message keeps "Connection" on the first line.
  row: {
    gap: t.spacing.xs,
    minHeight: t.metrics.minTapSize,
    padding: t.spacing.xs,
    borderRadius: t.metrics.cardRadius + 4,
    backgroundColor: t.colors.surfaceRaised,
  },
  floating: {
    minHeight: t.metrics.minTapSize,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    gap: t.spacing.sm,
    borderRadius: FLOATING_RADIUS,
    backgroundColor: t.colors.surfaceOverlay,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    shadowColor: t.colors.canvas,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  pin: { width: '100%', maxWidth: INAPP_MAX_WIDTH, alignSelf: 'center' },
  washIcon: { paddingTop: airy.line },
  text: { flex: 1, gap: airy.line },
  washText: { paddingRight: t.spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'center' },
  washActions: { marginTop: -t.spacing.xs },
}));

interface BannerProps {
  title?: string;
  message?: string;
  look?: BannerLook;
  tone?: Tone;
  icon?: IconName;
  /** A mark in place of the icon (the Agent's program). */
  leading?: ReactNode;
  /** Floating: a blocked Agent's captured question; three monospaced lines replace the message. */
  question?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Shows a close button; floating: a swipe up, or the accessibility action. */
  onDismiss?: () => void;
  dismissLabel?: string;
  /** Floating: tap opens the Agent. */
  onPress?: () => void;
  /** Floating: false plays the exit (slide up and fade) and then calls `onExited`. */
  visible?: boolean;
  /** Floating: false jumps to the end state (the atlas pins its clock, which stalls timings). */
  animated?: boolean;
  onExited?: () => void;
  testID?: string;
}

// Web paints a focus ring on the first focusable thing in a Modal; the banner is not a form control.
const WEB_NO_RING = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as object | null;

/** The one banner: inline notices (wash), chat rows (row) and the in-app alert (floating). */
export function Banner(props: BannerProps) {
  const {
    title,
    message,
    look = 'wash',
    tone = 'info',
    icon,
    leading,
    question,
    actionLabel,
    onAction,
    onDismiss,
    dismissLabel = 'Dismiss',
    testID = 'banner',
  } = props;
  const styles = useStyles();
  const theme = useTheme();
  const ink = theme.tone(tone);
  const wash = look === 'wash';
  const floating = look === 'floating';
  const content = (
    <>
      <View style={wash ? styles.washIcon : null}>
        {leading ?? <Icon name={icon ?? TONE_ICON[tone]} tint={ink} />}
      </View>
      <View
        style={[styles.text, wash && styles.washText]}
        accessible={!floating}
        accessibilityRole={tone === 'danger' ? 'alert' : 'text'}
      >
        {title ? (
          <Text
            variant={floating ? 'subheadline' : 'headline'}
            semibold
            numberOfLines={floating ? 1 : undefined}
          >
            {title}
          </Text>
        ) : null}
        {question ? (
          <Text
            variant="footnote"
            monospaced
            tone="secondary"
            numberOfLines={3}
            testID={`${testID}-question`}
          >
            {question}
          </Text>
        ) : message ? (
          <Text
            variant={wash ? 'callout' : 'footnote'}
            tone="secondary"
            numberOfLines={floating ? 2 : undefined}
          >
            {message}
          </Text>
        ) : null}
      </View>
    </>
  );
  if (floating) return <Floating {...props} testID={testID} content={content} />;
  return (
    <View
      style={[styles.base, styles[look], wash && { backgroundColor: theme.wash(ink) }]}
      testID={testID}
    >
      {content}
      <View style={[styles.actions, wash && styles.washActions]}>
        {actionLabel && onAction ? (
          <Button
            kind="text"
            size={wash ? 'small' : 'mini'}
            title={actionLabel}
            onPress={onAction}
            testID={`${testID}-action`}
          />
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

/** The floating look: slides and fades in, opens on tap, leaves on a swipe up. */
function Floating({
  content,
  title,
  message,
  question,
  visible = true,
  animated = true,
  onExited,
  onPress,
  onDismiss,
  dismissLabel = 'Dismiss',
  testID,
}: BannerProps & { content: ReactNode }) {
  const styles = useStyles();
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
    // A later run on the same value supersedes this one; no cleanup stop (it wedged web's driver).
    quick(appear, visible ? 1 : 0, reduceMotion, 'overlay').start(({ finished }) => {
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
  const body = question ?? message ?? '';
  const slide = appear.interpolate({ inputRange: [0, 1], outputRange: [-SLIDE, 0] });
  return (
    <Animated.View
      {...swipe.panHandlers}
      style={[styles.pin, { opacity: appear, transform: [{ translateY: slide }] }]}
    >
      <Tappable
        testID={testID}
        style={[styles.base, styles.floating, WEB_NO_RING]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={title ? `${title}. ${body}` : body}
        accessibilityActions={onDismiss ? [{ name: 'dismiss', label: dismissLabel }] : undefined}
        onAccessibilityAction={() => onDismiss?.()}
      >
        {content}
      </Tappable>
    </Animated.View>
  );
}
