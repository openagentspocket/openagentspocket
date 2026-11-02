import { type ReactNode, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, View } from 'react-native';
import type { Tone } from '../theme/status';
import { makeStyles, useTheme } from '../theme/theme';
import { Icon, type IconName } from './Icon';
import { useSurfaceFill } from './surfaceFill';
import { Text } from './Text';

export interface SwipeAction {
  key: string;
  title: string;
  icon?: IconName;
  tone?: Tone;
  onPress: () => void;
}

export const SWIPE_ACTION_WIDTH = 76;
/** How far past the start a swipe must travel to snap open. */
const OPEN_THRESHOLD = 40;

const useStyles = makeStyles(() => ({
  root: { overflow: 'hidden' },
  actions: { position: 'absolute', top: 0, bottom: 0, right: 0, flexDirection: 'row' },
  action: {
    width: SWIPE_ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
}));

interface SwipeRowProps {
  actions: readonly SwipeAction[];
  children: ReactNode;
}

/**
 * Trailing swipe actions under a row: swipe left to reveal, tap one to run it.
 * Screen readers reach the same actions through the row's accessibility actions.
 * The front is filled with the enclosing card's (or sheet's, or screen's) fill to cover them.
 */
export function SwipeRow({ actions, children }: SwipeRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const frontFill = theme.colors[useSurfaceFill()];
  const width = actions.length * SWIPE_ACTION_WIDTH;
  const offset = useRef(new Animated.Value(0)).current;
  const [open, setOpen] = useState(false);
  // The responder is created once; it reads the latest state through this ref.
  const latest = useRef({ open, width });
  latest.current = { open, width };

  const snap = (toOpen: boolean) => {
    setOpen(toOpen);
    Animated.spring(offset, {
      toValue: toOpen ? -latest.current.width : 0,
      useNativeDriver: true,
      bounciness: 0,
    }).start();
  };
  const snapAfter = (dx: number) =>
    snap(latest.current.open ? dx < OPEN_THRESHOLD : dx < -OPEN_THRESHOLD);
  const handlers = useRef({ snapAfter });
  handlers.current.snapAfter = snapAfter;

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        const { open: isOpen, width: full } = latest.current;
        offset.setValue(Math.min(0, Math.max(-full * 1.2, (isOpen ? -full : 0) + g.dx)));
      },
      onPanResponderRelease: (_, g) => handlers.current.snapAfter(g.dx),
      onPanResponderTerminate: (_, g) => handlers.current.snapAfter(g.dx),
    }),
  ).current;

  return (
    <View style={styles.root}>
      <View
        style={styles.actions}
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
      >
        {actions.map((action) => {
          const fill = theme.tone(action.tone ?? 'neutral');
          return (
            <Pressable
              key={action.key}
              style={[styles.action, { backgroundColor: fill }]}
              accessibilityRole="button"
              accessibilityLabel={action.title}
              onPress={() => {
                snap(false);
                action.onPress();
              }}
              testID={`swipe-action-${action.key}`}
            >
              {action.icon ? <Icon name={action.icon} color="onAccent" /> : null}
              <Text variant="label" tone="onAccent" numberOfLines={1}>
                {action.title}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Animated.View
        style={{ backgroundColor: frontFill, transform: [{ translateX: offset }] }}
        testID="swipe-row-front"
        {...responder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}
