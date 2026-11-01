import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  useWindowDimensions,
  View,
  type ViewInstance,
} from 'react-native';
import { Button } from '../primitives/Button';
import { Icon, type IconName } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { useInsets } from '../theme/insets';
import { makeStyles, useTheme } from '../theme/theme';

export interface ActionMenuItem {
  key: string;
  title: string;
  icon?: IconName;
  destructive?: boolean;
  disabled?: boolean;
  /** A checkmark, for a picker's current choice. */
  checked?: boolean;
  onPress: () => void;
}

/** A trigger's frame in window coordinates; the menu opens under it (or above, near the bottom). */
export interface MenuAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** iOS cannot present an alert while a menu's modal is still closing: run the action after it. */
export const MENU_DISMISS_MS = Platform.OS === 'ios' ? 300 : 0;
const MENU_WIDTH = 250;
const MEASURE_TIMEOUT_MS = 80;

const useStyles = makeStyles((t) => ({
  backdrop: { flex: 1, backgroundColor: t.backdrop },
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    backgroundColor: t.colors.surfaceOverlay,
    borderRadius: t.metrics.cardRadius,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    overflow: 'hidden',
  },
  title: { paddingHorizontal: t.spacing.md, paddingTop: t.spacing.sm, paddingBottom: t.spacing.xs },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    minHeight: t.metrics.minTapSize,
    paddingHorizontal: t.spacing.md,
  },
  separator: { height: t.metrics.hairlineWidth, backgroundColor: t.hairline },
  pressed: { backgroundColor: t.colors.surfaceRaised },
  disabled: { opacity: 0.4 },
  label: { flex: 1 },
}));

interface ActionMenuProps {
  items: readonly ActionMenuItem[];
  visible: boolean;
  onClose: () => void;
  title?: string;
  anchor?: MenuAnchor;
  testID?: string;
}

/** The one menu (context menu, popover, header "more"). An item closes the menu, then runs. */
export function ActionMenu({
  items,
  visible,
  onClose,
  title,
  anchor,
  testID = 'action-menu',
}: ActionMenuProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useInsets();
  const window = useWindowDimensions();
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (visible || !pending.current) return;
    const run = pending.current;
    pending.current = null;
    const timer = setTimeout(run, MENU_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  const estimated = items.length * theme.metrics.minTapSize + (title ? 40 : 0);
  const margin = theme.spacing.xs;
  const left = anchor
    ? Math.min(
        Math.max(margin, anchor.x + anchor.width - MENU_WIDTH),
        window.width - MENU_WIDTH - margin,
      )
    : (window.width - MENU_WIDTH) / 2;
  const below = anchor ? anchor.y + anchor.height + 4 : 0;
  const fitsBelow = below + estimated < window.height - insets.bottom - margin;
  const position = anchor
    ? fitsBelow
      ? { left, top: below }
      : { left, bottom: window.height - anchor.y + 4 }
    : { left, bottom: insets.bottom + theme.spacing.lg };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityElementsHidden
        importantForAccessibility="no"
        testID={`${testID}-backdrop`}
      />
      <View style={[styles.menu, position]} accessibilityViewIsModal testID={testID}>
        {title ? (
          <Text variant="caption" tone="secondary" style={styles.title} accessibilityRole="header">
            {title}
          </Text>
        ) : null}
        {items.map((item, index) => (
          <View key={item.key}>
            {index > 0 || title ? <View style={styles.separator} /> : null}
            <Pressable
              accessibilityRole="menuitem"
              accessibilityLabel={item.title}
              accessibilityState={{
                disabled: item.disabled ?? false,
                checked: item.checked,
                selected: item.checked,
              }}
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
              <Text
                tone={item.destructive ? 'danger' : 'primary'}
                style={styles.label}
                numberOfLines={1}
              >
                {item.title}
              </Text>
              {item.checked ? <Icon name="check" color="accent" /> : null}
              {item.icon ? (
                <Icon name={item.icon} color={item.destructive ? 'danger' : 'textSecondary'} />
              ) : null}
            </Pressable>
          </View>
        ))}
      </View>
    </Modal>
  );
}

interface ActionMenuButtonProps {
  items: readonly ActionMenuItem[];
  accessibilityLabel: string;
  title?: string;
  icon?: IconName;
  testID?: string;
}

/** A header "more" button that opens an ActionMenu under itself. */
export function ActionMenuButton({
  items,
  accessibilityLabel,
  title,
  icon = 'more',
  testID = 'menu-button',
}: ActionMenuButtonProps) {
  const ref = useRef<ViewInstance>(null);
  const [menu, setMenu] = useState<{ anchor?: MenuAnchor } | null>(null);
  const open = () => {
    let shown = false;
    const show = (anchor?: MenuAnchor) => {
      if (shown) return;
      shown = true;
      setMenu({ anchor });
    };
    ref.current?.measureInWindow?.((x, y, width, height) => show({ x, y, width, height }));
    // Unmeasurable (tests, a detached view): open centered instead of never.
    setTimeout(() => show(), MEASURE_TIMEOUT_MS);
  };
  return (
    <View ref={ref} collapsable={false}>
      <Button
        kind="text"
        icon={icon}
        accessibilityLabel={accessibilityLabel}
        onPress={open}
        testID={testID}
      />
      <ActionMenu
        items={items}
        title={title}
        visible={menu !== null}
        anchor={menu?.anchor}
        onClose={() => setMenu(null)}
      />
    </View>
  );
}
