import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Modal, useWindowDimensions, View } from 'react-native';
import { Icon } from '../primitives/Icon';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { useInsets } from '../theme/insets';
import { makeStyles, useTheme } from '../theme/theme';
import type { ActionMenuItem, MenuAnchor } from './ActionMenu';
import { MENU_DISMISS_MS } from './dismiss';

const useStyles = makeStyles((t) => ({
  backdrop: { flex: 1, backgroundColor: t.backdrop },
  stage: {
    ...({ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } as const),
    justifyContent: 'center',
    paddingHorizontal: t.spacing.md,
    gap: t.spacing.sm,
  },
  inline: { gap: t.spacing.sm, paddingHorizontal: t.spacing.md },
  lifted: { gap: t.spacing.sm },
  menu: {
    alignSelf: 'flex-start',
    minWidth: 250,
    backgroundColor: t.colors.surfaceOverlay,
    borderRadius: t.metrics.cardRadius,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    minHeight: t.metrics.rowMinHeight,
    paddingHorizontal: t.spacing.md,
  },
  pressed: { backgroundColor: t.colors.surfaceRaised },
  disabled: { opacity: 0.4 },
  divider: {
    height: t.metrics.hairlineWidth,
    backgroundColor: t.hairline,
    marginHorizontal: t.spacing.md,
  },
  icon: { width: 24, alignItems: 'center' },
}));

interface LiftedMenuProps {
  /** The pressed row, kept visible at its own width above the menu. */
  preview: ReactNode;
  items: readonly ActionMenuItem[];
  visible: boolean;
  onClose: () => void;
  /** Where the press happened: the card and menu open around it, kept on screen. Centered without one. */
  anchor?: MenuAnchor;
  /** Draws in place instead of a Modal (the gallery and tests). */
  inline?: boolean;
  /** Runs when the menu appears (the long-press haptic). */
  onOpen?: () => void;
  testID?: string;
}

/**
 * The lifted menu: the pressed card lifts at full width above a raised menu
 * (accent icons; destructive actions in red below a divider). An item closes the menu, then runs.
 */
export function LiftedMenu({
  preview,
  items,
  visible,
  onClose,
  anchor,
  inline = false,
  onOpen,
  testID = 'lifted-menu',
}: LiftedMenuProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useInsets();
  const window = useWindowDimensions();
  const [height, setHeight] = useState(0);
  // A trigger forgets its anchor on close; the menu fades out where it stood.
  const lastAnchor = useRef(anchor);
  if (anchor) lastAnchor.current = anchor;
  const point = anchor ?? lastAnchor.current;
  const margin = theme.spacing.xs;
  const highest = insets.top + margin;
  const lowest = window.height - insets.bottom - margin - height;
  const placed = point
    ? {
        justifyContent: 'flex-start' as const,
        paddingTop: Math.max(highest, Math.min(point.y - height / 2, lowest)),
        opacity: height > 0 ? 1 : 0,
      }
    : undefined;
  const pending = useRef<(() => void) | null>(null);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  useEffect(() => {
    if (visible) {
      onOpenRef.current?.();
      return;
    }
    if (!pending.current) return;
    const run = pending.current;
    pending.current = null;
    const timer = setTimeout(run, MENU_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [visible]);
  const regular = items.filter((item) => !item.destructive);
  const destructive = items.filter((item) => item.destructive);
  const renderItem = (item: ActionMenuItem) => (
    <Tappable
      key={item.key}
      accessibilityRole="menuitem"
      accessibilityLabel={item.title}
      accessibilityState={{ disabled: item.disabled ?? false }}
      disabled={item.disabled}
      onPress={() => {
        pending.current = item.onPress;
        onClose();
      }}
      style={({ pressed }) => [
        styles.item,
        pressed && styles.pressed,
        item.disabled && styles.disabled,
      ]}
      testID={`${testID}-${item.key}`}
    >
      <View style={styles.icon}>
        {item.icon ? (
          <Icon name={item.icon} size={20} color={item.destructive ? 'danger' : 'accent'} />
        ) : null}
      </View>
      <Text tone={item.destructive ? 'danger' : 'primary'} numberOfLines={1}>
        {item.title}
      </Text>
    </Tappable>
  );
  const stage = (
    <View style={inline ? styles.inline : [styles.stage, placed]} pointerEvents="box-none">
      <View
        style={styles.lifted}
        pointerEvents="box-none"
        onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      >
        <View testID={`${testID}-preview`} pointerEvents="none">
          {preview}
        </View>
        <View style={styles.menu} accessibilityViewIsModal testID={testID}>
          {regular.map(renderItem)}
          {regular.length > 0 && destructive.length > 0 ? <View style={styles.divider} /> : null}
          {destructive.map(renderItem)}
        </View>
      </View>
    </View>
  );
  if (inline) return visible ? stage : null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Tappable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityElementsHidden
        importantForAccessibility="no"
        testID={`${testID}-backdrop`}
      />
      {stage}
    </Modal>
  );
}
