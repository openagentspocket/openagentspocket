import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ActionMenu, type ActionMenuItem } from '../overlay/ActionMenu';
import { useAnchor } from '../overlay/anchors';
import { useRowMenu } from '../overlay/useRowMenu';
import { airy } from '../theme/metrics';
import { makeStyles } from '../theme/theme';
import { Icon, type IconName } from './Icon';
import { type SwipeAction, SwipeRow } from './SwipeRow';
import { Tappable } from './Tappable';
import { Text, type TextTone } from './Text';

/** Width of the leading symbol slot of a settings-style row (Swift: 22 pt glyph in a 28 pt slot). */
export const ICON_SLOT = 28;

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    minHeight: t.metrics.rowMinHeight,
    paddingHorizontal: t.spacing.md,
    paddingVertical: airy.rowInset,
  },
  iconSlot: { width: ICON_SLOT, alignItems: 'center' },
  pressed: { backgroundColor: t.colors.surfaceRaised },
  selected: { backgroundColor: t.colors.control },
  disabled: { opacity: 0.4 },
  text: { flex: 1, gap: airy.line },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs, flexShrink: 0 },
  // A long value truncates before it can squeeze the title.
  value: { flexShrink: 1, maxWidth: 120 },
}));

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** An icon, a ProgramMark, a StatusDot. */
  leading?: ReactNode;
  /** A settings-style leading symbol: 22 pt, tinted secondary. */
  icon?: IconName;
  /** Sets the title in the monospaced face (addresses). */
  titleMono?: boolean;
  /** Sets the subtitle in monospaced caption (dates, sizes, paths). */
  subtitleMono?: boolean;
  /** Lines the title may take before it truncates (1 by default). */
  titleLines?: number;
  /** Where a long title is cut: `middle` keeps a model name's version. */
  titleEllipsize?: 'tail' | 'middle';
  /** Ink of the title (secondary for a placeholder row). */
  titleTone?: TextTone;
  /** Sets the title in semibold (Host names). */
  titleSemibold?: boolean;
  /** The subtitle's size: footnote by default, subheadline for a larger address line. */
  subtitleVariant?: 'footnote' | 'subheadline';
  /** Lines the subtitle may take before it truncates (2 by default). */
  subtitleLines?: number;
  /** Content under the title and subtitle (chips, a second caption). */
  detail?: ReactNode;
  /** A short value in secondary text before the trailing slot ("Índigo", "3 hosts"). */
  value?: string;
  /** Drawn just before the value (the palette dots of the Theme row). */
  valueLeading?: ReactNode;
  /** Ink of the value; accent for a value that opens a menu (pickers). */
  valueTone?: TextTone;
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
  /** The row shown in the detail column: filled with the control surface. */
  selected?: boolean;
  disabled?: boolean;
  /** Overrides the spoken label (title, subtitle and value by default). */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Registers the row as a popover anchor (`confirm({ anchorKey })`). */
  anchorKey?: string;
  testID?: string;
}

/**
 * The one list row: leading slot, title and subtitle, value, trailing slot, chevron, swipe and
 * long-press actions. Transparent: it shows the card (or screen) that holds it.
 */
export function ListRow({
  title,
  subtitle,
  subtitleMono = false,
  titleMono = false,
  titleSemibold = false,
  titleTone = 'primary',
  titleLines = 1,
  titleEllipsize,
  subtitleVariant = 'footnote',
  subtitleLines = 2,
  leading,
  icon,
  detail,
  value,
  valueLeading,
  valueTone = 'secondary',
  trailing,
  chevron = false,
  onPress,
  menu,
  menuTitle,
  swipeActions,
  leadingSwipeActions,
  fullSwipe,
  selected = false,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  anchorKey,
  testID,
}: ListRowProps) {
  const styles = useStyles();
  const anchorRef = useAnchor(anchorKey);
  const rowMenu = useRowMenu(menu, swipeActions, leadingSwipeActions);
  const spoken = accessibilityLabel ?? [title, subtitle, value].filter(Boolean).join(', ');

  const body = (
    <Tappable
      ref={anchorRef}
      onPress={onPress}
      onLongPress={rowMenu.onLongPress}
      disabled={disabled || (!onPress && !menu?.length)}
      accessible
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={spoken}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, selected }}
      {...rowMenu.a11y}
      style={({ pressed }) => [
        styles.row,
        selected && styles.selected,
        pressed && (onPress || menu?.length) ? styles.pressed : null,
        disabled && styles.disabled,
      ]}
      testID={testID}
    >
      {icon ? (
        <View style={styles.iconSlot}>
          <Icon name={icon} size={22} color="textSecondary" />
        </View>
      ) : (
        leading
      )}
      <View style={styles.text}>
        <Text
          numberOfLines={titleLines}
          ellipsizeMode={titleEllipsize}
          monospaced={titleMono}
          semibold={titleSemibold}
          tone={titleTone}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            variant={subtitleMono ? 'caption' : subtitleVariant}
            monospaced={subtitleMono}
            tone="secondary"
            numberOfLines={subtitleLines}
          >
            {subtitle}
          </Text>
        ) : null}
        {detail}
      </View>
      <View style={styles.trailing}>
        {valueLeading}
        {value ? (
          <Text variant="callout" tone={valueTone} numberOfLines={1} style={styles.value}>
            {value}
          </Text>
        ) : null}
        {trailing}
        {chevron ? <Icon name="chevronRight" size={13} color="textTertiary" /> : null}
      </View>
    </Tappable>
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
      {menu?.length ? <ActionMenu items={menu} title={menuTitle} {...rowMenu.menuProps} /> : null}
    </>
  );
}
