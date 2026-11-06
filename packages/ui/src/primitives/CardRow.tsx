import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ActionMenu, type ActionMenuItem } from '../overlay/ActionMenu';
import { useRowMenu } from '../overlay/useRowMenu';
import { airy } from '../theme/metrics';
import { makeStyles } from '../theme/theme';
import type { ColorKey } from '../theme/tokens.generated';
import { Card, type CardLevel } from './Card';
import { type SwipeAction, SwipeRow } from './SwipeRow';

const useStyles = makeStyles((t) => ({
  row: { paddingVertical: airy.rowInset },
  ring: {
    ...({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const),
    borderRadius: t.metrics.cardRadius,
    borderWidth: 2,
    borderColor: t.colors.accent,
  },
}));

interface CardRowProps {
  children: ReactNode;
  onPress?: () => void;
  /** Long press opens these in an ActionMenu (also reachable as accessibility actions). */
  menu?: readonly ActionMenuItem[];
  menuTitle?: string;
  /** Trailing swipe actions (swipe left). */
  swipeActions?: readonly SwipeAction[];
  /** Leading swipe actions (swipe right), such as Pin. */
  leadingSwipeActions?: readonly SwipeAction[];
  /** Full swipe runs the first action of that edge. */
  fullSwipe?: { leading?: boolean; trailing?: boolean };
  /** The row open in the detail column (iPad, Mac): a 2 pt accent ring around the card. */
  selected?: boolean;
  /** Outlines a card that asks for attention in this color (at 40%). */
  accent?: ColorKey;
  level?: CardLevel;
  /** False when the content pads itself (a host card at 18). */
  padded?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

/**
 * The one list item for card lists (Home, Agents, Hosts, Files, Ports): a `Card` on the glowing
 * canvas with the row inset above and below, an optional selection ring, long-press menu and
 * swipe actions both ways. Content supplies its own layout.
 */
export function CardRow({
  children,
  onPress,
  menu,
  menuTitle,
  swipeActions,
  leadingSwipeActions,
  fullSwipe,
  selected = false,
  accent,
  level,
  padded,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: CardRowProps) {
  const styles = useStyles();
  const rowMenu = useRowMenu(menu, swipeActions, leadingSwipeActions);
  const card = (
    <View>
      <Card
        level={level}
        accent={accent}
        padded={padded}
        onPress={onPress}
        onLongPress={rowMenu.onLongPress}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        {...rowMenu.a11y}
        testID={testID}
      >
        {children}
      </Card>
      {selected ? (
        <View style={styles.ring} pointerEvents="none" testID="card-row-selected" />
      ) : null}
    </View>
  );
  return (
    <View style={styles.row}>
      {swipeActions?.length || leadingSwipeActions?.length ? (
        <SwipeRow actions={swipeActions} leadingActions={leadingSwipeActions} fullSwipe={fullSwipe}>
          {card}
        </SwipeRow>
      ) : (
        card
      )}
      {menu?.length ? <ActionMenu items={menu} title={menuTitle} {...rowMenu.menuProps} /> : null}
    </View>
  );
}
