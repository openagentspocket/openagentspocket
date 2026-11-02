import { type ReactNode, useState } from 'react';
import { type AccessibilityActionEvent, Pressable, View } from 'react-native';
import { ActionMenu, type ActionMenuItem } from '../overlay/ActionMenu';
import { airy } from '../theme/metrics';
import { makeStyles } from '../theme/theme';
import { Icon, type IconName } from './Icon';
import { type SwipeAction, SwipeRow } from './SwipeRow';
import { Text } from './Text';

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    minHeight: t.metrics.rowMinHeight,
    paddingHorizontal: t.spacing.md,
    paddingVertical: airy.rowInset,
  },
  pressed: { backgroundColor: t.colors.surfaceRaised },
  disabled: { opacity: 0.4 },
  text: { flex: 1, gap: 2 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs, flexShrink: 0 },
}));

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** An icon, a ProgramMark, a StatusDot. */
  leading?: ReactNode;
  /** A settings-style leading symbol: 22 pt, tinted secondary. */
  icon?: IconName;
  /** A short value in secondary text before the trailing slot ("Índigo", "3 hosts"). */
  value?: string;
  /** A badge, a switch, a copy button. */
  trailing?: ReactNode;
  /** Shows a disclosure chevron: the row pushes a screen. */
  chevron?: boolean;
  onPress?: () => void;
  /** Long press opens these in an ActionMenu (also reachable as accessibility actions). */
  menu?: readonly ActionMenuItem[];
  menuTitle?: string;
  /** Trailing swipe actions (also reachable as accessibility actions). */
  swipeActions?: readonly SwipeAction[];
  /** Leading swipe actions (swipe right), such as Pin. */
  leadingSwipeActions?: readonly SwipeAction[];
  /** Full swipe runs the first action of the edge. */
  fullSwipe?: { leading?: boolean; trailing?: boolean };
  disabled?: boolean;
  /** Overrides the spoken label (title, subtitle and value by default). */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

/**
 * The one list row: leading slot, title and subtitle, value, trailing slot, chevron, swipe and
 * long-press actions. Transparent: it shows the card (or screen) that holds it.
 */
export function ListRow({
  title,
  subtitle,
  leading,
  icon,
  value,
  trailing,
  chevron = false,
  onPress,
  menu,
  menuTitle,
  swipeActions,
  leadingSwipeActions,
  fullSwipe,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ListRowProps) {
  const styles = useStyles();
  const [menuOpen, setMenuOpen] = useState(false);
  // Swipe and menu actions, once each by key, as screen-reader actions.
  const extra = [...(swipeActions ?? []), ...(leadingSwipeActions ?? []), ...(menu ?? [])].filter(
    (action, index, all) => all.findIndex((other) => other.key === action.key) === index,
  );
  const onAccessibilityAction = (event: AccessibilityActionEvent) =>
    extra.find((action) => action.key === event.nativeEvent.actionName)?.onPress();
  const spoken = accessibilityLabel ?? [title, subtitle, value].filter(Boolean).join(', ');

  const body = (
    <Pressable
      onPress={onPress}
      onLongPress={menu?.length ? () => setMenuOpen(true) : undefined}
      disabled={disabled || (!onPress && !menu?.length)}
      accessible
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={spoken}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      accessibilityActions={extra.map((action) => ({ name: action.key, label: action.title }))}
      onAccessibilityAction={onAccessibilityAction}
      style={({ pressed }) => [
        styles.row,
        pressed && (onPress || menu?.length) ? styles.pressed : null,
        disabled && styles.disabled,
      ]}
      testID={testID}
    >
      {icon ? <Icon name={icon} size={22} color="textSecondary" /> : leading}
      <View style={styles.text}>
        <Text numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text variant="footnote" tone="secondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.trailing}>
        {value ? (
          <Text variant="callout" tone="secondary" numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        {trailing}
        {chevron ? <Icon name="chevronRight" size={13} color="textTertiary" /> : null}
      </View>
    </Pressable>
  );

  return (
    <>
      {swipeActions?.length || leadingSwipeActions?.length ? (
        <SwipeRow actions={swipeActions} leadingActions={leadingSwipeActions} fullSwipe={fullSwipe}>
          {body}
        </SwipeRow>
      ) : (
        body
      )}
      {menu?.length ? (
        <ActionMenu
          items={menu}
          title={menuTitle}
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
        />
      ) : null}
    </>
  );
}
