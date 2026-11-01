import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View } from 'react-native';
import { Icon } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { useInsets } from '../theme/insets';
import { makeStyles, useTheme } from '../theme/theme';
import { useActiveHost, useQueue } from './store';
import { TOAST_DEFAULT_MS, type ToastRequest, toastQueue } from './toast';

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
    borderRadius: t.metrics.cardRadius,
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
  text: { flex: 1, gap: 2 },
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
  const onPress = () => {
    dismiss();
    request.onPress?.();
  };
  const ink = theme.tone(request.tone ?? 'accent');
  return (
    <Animated.View
      style={[
        styles.toast,
        {
          opacity: appear,
          transform: [
            { translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) },
          ],
        },
      ]}
    >
      <Pressable
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
            <Text variant="caption" tone="secondary" numberOfLines={2}>
              {request.message}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}
