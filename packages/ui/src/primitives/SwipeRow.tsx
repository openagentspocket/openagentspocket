import { type ReactNode, useRef, useState } from 'react';
import { Animated, PanResponder, View } from 'react-native';
import { impact } from '../haptics';
import { snappy, useReducedMotion } from '../motion';
import { airy } from '../theme/metrics';
import type { Tone } from '../theme/status';
import { makeStyles, useTheme } from '../theme/theme';
import { Icon, type IconName } from './Icon';
import { useSurfaceFill } from './surfaceFill';
import {
  dragOffset,
  passedFullSwipe,
  restOffset,
  type SwipeEdges,
  type SwipeRest,
  settleSwipe,
} from './swipeMath';
import { Tappable } from './Tappable';
import { Text } from './Text';

export interface SwipeAction {
  key: string;
  title: string;
  icon?: IconName;
  tone?: Tone;
  onPress: () => void;
}

export const SWIPE_ACTION_WIDTH = 76;

const useStyles = makeStyles(() => ({
  root: { overflow: 'hidden' },
  leading: { position: 'absolute', top: 0, bottom: 0, left: 0, flexDirection: 'row' },
  trailing: { position: 'absolute', top: 0, bottom: 0, right: 0, flexDirection: 'row' },
  action: { alignItems: 'center', justifyContent: 'center', gap: airy.line },
}));

interface SwipeRowProps {
  /** Trailing buttons: swipe left to reveal. */
  actions?: readonly SwipeAction[];
  /** Leading buttons: swipe right to reveal (Pin). */
  leadingActions?: readonly SwipeAction[];
  /** A long swipe past ~55% of the row runs the edge's first action (Swift `allowsFullSwipe`). */
  fullSwipe?: { leading?: boolean; trailing?: boolean };
  children: ReactNode;
}

/**
 * Swipe actions under a row, on either edge, with an optional full swipe that commits the
 * edge's first action (a light haptic marks the line). Screen readers reach the same actions
 * through the row's accessibility actions. The front is filled with the enclosing card's (or
 * sheet's, or screen's) fill to cover the buttons. After an action the row settles closed, so a
 * confirmation can appear while the row stays.
 */
export function SwipeRow({
  actions = [],
  leadingActions = [],
  fullSwipe,
  children,
}: SwipeRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const reduce = useReducedMotion();
  const frontFill = theme.colors[useSurfaceFill()];
  const offset = useRef(new Animated.Value(0)).current;
  const [rest, setRest] = useState<SwipeRest>('closed');
  const [rowWidth, setRowWidth] = useState(0);
  const edges: SwipeEdges = {
    leading: leadingActions.length * SWIPE_ACTION_WIDTH,
    trailing: actions.length * SWIPE_ACTION_WIDTH,
    leadingFull: Boolean(fullSwipe?.leading && leadingActions.length),
    trailingFull: Boolean(fullSwipe?.trailing && actions.length),
    rowWidth,
  };
  // The responder is created once; it reads the latest state through this ref.
  const latest = useRef({ rest, edges, reduce, leadingActions, actions });
  latest.current = { rest, edges, reduce, leadingActions, actions };
  const crossed = useRef(false);
  const live = useRef(0);

  const goTo = (next: SwipeRest) => {
    setRest(next);
    live.current = restOffset(next, latest.current.edges);
    snappy(offset, restOffset(next, latest.current.edges), latest.current.reduce).start();
  };
  const commit = (list: readonly SwipeAction[]) => {
    goTo('closed');
    list[0]?.onPress();
  };
  const release = () => {
    const cur = latest.current;
    const outcome = settleSwipe(live.current, cur.rest, cur.edges);
    crossed.current = false;
    if (outcome === 'commit-leading') commit(cur.leadingActions);
    else if (outcome === 'commit-trailing') commit(cur.actions);
    else goTo(outcome);
  };

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        const cur = latest.current;
        live.current = dragOffset(g.dx, cur.rest, cur.edges);
        offset.setValue(live.current);
        const past = passedFullSwipe(live.current, cur.edges) !== null;
        if (past !== crossed.current) {
          crossed.current = past;
          if (past) impact('light');
        }
      },
      onPanResponderRelease: release,
      onPanResponderTerminate: release,
    }),
  ).current;

  const buttons = (list: readonly SwipeAction[], style: object) => (
    <View
      style={style}
      accessibilityElementsHidden={rest === 'closed'}
      importantForAccessibility={rest === 'closed' ? 'no-hide-descendants' : 'auto'}
    >
      {list.map((action) => (
        <Tappable
          key={action.key}
          style={[
            styles.action,
            { width: SWIPE_ACTION_WIDTH, backgroundColor: theme.tone(action.tone ?? 'neutral') },
          ]}
          accessibilityRole="button"
          accessibilityLabel={action.title}
          onPress={() => {
            goTo('closed');
            action.onPress();
          }}
          testID={`swipe-action-${action.key}`}
        >
          {action.icon ? <Icon name={action.icon} color="onAccent" /> : null}
          <Text variant="caption" semibold tone="onAccent" numberOfLines={1}>
            {action.title}
          </Text>
        </Tappable>
      ))}
    </View>
  );

  return (
    <View style={styles.root} onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
      {leadingActions.length ? buttons(leadingActions, styles.leading) : null}
      {actions.length ? buttons(actions, styles.trailing) : null}
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
