import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, PanResponder, StyleSheet, View } from 'react-native';
import { Icon } from '../primitives/Icon';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { rounded } from '../theme/corners';
import { useInsets } from '../theme/insets';
import { airy } from '../theme/metrics';
import { makeStyles, useTheme } from '../theme/theme';
import { useActiveHost, useQueue } from './store';
import { TOAST_DEFAULT_MS, type ToastRequest, toastQueue } from './toast';

const TOAST_SWIPE_DISMISS = 40;

const useStyles = makeStyles((t) => ({
  layer: { ...StyleSheet.absoluteFill, alignItems: 'center' },
  toast: {
    width: '100%',
    maxWidth: t.metrics.readableWidth,
    paddingHorizontal: t.spacing.xs,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    backgroundColor: t.colors.surfaceRaised,
    ...rounded(t.radius.card),
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    shadowColor: t.colors.canvas,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: { flex: 1, gap: airy.line },
}));

/** Shows the head of the toast() queue at the top of the screen. Mounted once, by OverlayHost. */
export function ToastHost() {
  const active = useActiveHost('toast');
  const queue = useQueue(toastQueue);
  const current = active ? queue[0] : undefined;
  const styles = useStyles();
  const insets = useInsets();
  const theme = useTheme();
  return (
    <View
      style={[styles.layer, { paddingTop: insets.top + theme.spacing.xs }]}
      pointerEvents="box-none"
    >
      {current ? <ToastCard key={current.id} request={current} /> : null}
    </View>
  );
}

function ToastCard({ request }: { request: ToastRequest }) {
  const styles = useStyles();
  const theme = useTheme();
  const appear = useRef(new Animated.Value(0)).current;
  const duration = request.durationMs ?? TOAST_DEFAULT_MS;

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      request.message ? `${request.title}. ${request.message}` : request.title,
    );
    Animated.timing(appear, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    if (duration <= 0) return;
    const timer = setTimeout(() => toastQueue.remove(request), duration);
    return () => clearTimeout(timer);
  }, [request, duration, appear]);

  const dismiss = () => toastQueue.remove(request);
  const swipe = useRef(new Animated.Value(0)).current;
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  // Swipe up to dismiss; a short drag springs back and a tap still reaches the Tappable.
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy < -6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => swipe.setValue(Math.min(0, g.dy)),
      onPanResponderRelease: (_e, g) => {
        if (g.dy < -TOAST_SWIPE_DISMISS || g.vy < -0.5) {
          Animated.timing(swipe, { toValue: -160, duration: 120, useNativeDriver: true }).start(
            () => dismissRef.current(),
          );
        } else {
          Animated.spring(swipe, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;
  const onPress = () => {
    dismiss();
    request.onPress?.();
  };
  const ink = theme.tone(request.tone ?? 'accent');
  return (
    <Animated.View
      {...pan.panHandlers}
      style={[
        styles.toast,
        {
          opacity: appear,
          transform: [
            { translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) },
            { translateY: swipe },
          ],
        },
      ]}
    >
      <Tappable
        style={styles.card}
        onPress={onPress}
        accessibilityRole={request.onPress ? 'button' : 'alert'}
        accessibilityLabel={
          request.message ? `${request.title}, ${request.message}` : request.title
        }
        accessibilityHint={request.accessibilityHint}
        accessibilityActions={[{ name: 'escape', label: 'Dismiss' }]}
        onAccessibilityAction={(event) => event.nativeEvent.actionName === 'escape' && dismiss()}
        testID="toast"
      >
        {request.leading ??
          (request.icon ? <Icon name={request.icon} tint={ink} size={20} /> : null)}
        <View style={styles.text}>
          <Text variant="headline" numberOfLines={1}>
            {request.title}
          </Text>
          {request.message ? (
            <Text variant="footnote" tone="secondary" numberOfLines={2}>
              {request.message}
            </Text>
          ) : null}
        </View>
      </Tappable>
    </Animated.View>
  );
}
