import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, useWindowDimensions, View, type ViewInstance } from 'react-native';
import { Button } from '../primitives/Button';
import { Icon, type IconName } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { useInsets } from '../theme/insets';
import { makeStyles, useTheme } from '../theme/theme';
import { MENU_DISMISS_MS } from './dismiss';
import { LiftedMenu } from './LiftedMenu';
import { groupMenuItems, isDeadMenuTrigger } from './menuGroups';
import { loadSwiftUi, NativeActionMenu } from './NativeActionMenu';

export type { MenuGroup } from './menuGroups';
export { groupMenuItems, isDeadMenuTrigger };

const MEASURE_TIMEOUT_MS = 80;

export interface ActionMenuItem {
  key: string;
  title: string;
  icon?: IconName;
  destructive?: boolean;
  disabled?: boolean;
  /** A checkmark, for a picker's current choice. */
  checked?: boolean;
  /** Starts a titled group ("Host name", "terminal · workspace · host"); runs until the next. */
  section?: string;
  /** A second line under the title, secondary ink. */
  subtitle?: string;
  onPress: () => void;
}

/** A trigger's frame in window coordinates; the menu opens under it (or above, near the bottom). */
export interface MenuAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export { MENU_DISMISS_MS };

const MENU_WIDTH = 250;

const useStyles = makeStyles((t) => ({
  backdrop: { flex: 1, backgroundColor: t.backdrop },
  menu: {
    position: 'absolute',
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
  groupGap: { height: 6, backgroundColor: t.colors.separator },
  sectionTitle: {
    paddingHorizontal: t.spacing.md,
    paddingTop: t.spacing.xs,
    paddingBottom: t.spacing.xxs,
  },
  itemText: { flex: 1 },
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
  /** The pressed card, lifted at its own width above the menu (the popover fallback of a native preview). */
  preview?: ReactNode;
  /** With a preview: draw in place instead of a Modal (the gallery and tests). */
  inline?: boolean;
  /** Menu width; a compact popover passes less than the default. */
  width?: number;
  testID?: string;
}

/** The one menu (context menu, popover, header "more"). An item closes the menu, then runs. */
export function ActionMenu({
  items,
  visible,
  onClose,
  title,
  anchor,
  preview,
  inline,
  width = MENU_WIDTH,
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
    ? Math.min(Math.max(margin, anchor.x + anchor.width - width), window.width - width - margin)
    : (window.width - width) / 2;
  const below = anchor ? anchor.y + anchor.height + 4 : 0;
  const fitsBelow = below + estimated < window.height - insets.bottom - margin;
  const position = anchor
    ? fitsBelow
      ? { left, top: below }
      : { left, bottom: window.height - anchor.y + 4 }
    : { left, bottom: insets.bottom + theme.spacing.lg };

  if (preview) {
    return (
      <LiftedMenu
        preview={preview}
        items={items}
        visible={visible}
        onClose={onClose}
        inline={inline}
        testID={testID}
      />
    );
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityElementsHidden
        importantForAccessibility="no"
        testID={`${testID}-backdrop`}
      />
      <View style={[styles.menu, { width }, position]} accessibilityViewIsModal testID={testID}>
        {title ? (
          <Text variant="footnote" tone="secondary" style={styles.title} accessibilityRole="header">
            {title}
          </Text>
        ) : null}
        {groupMenuItems(items).map((group, groupIndex) => (
          <View key={group.items[0]?.key}>
            {groupIndex > 0 ? (
              <View style={styles.groupGap} testID={`${testID}-group-gap`} />
            ) : null}
            {group.title ? (
              <Text
                variant="footnote"
                semibold
                tone="secondary"
                style={styles.sectionTitle}
                accessibilityRole="header"
              >
                {group.title}
              </Text>
            ) : null}
            {group.items.map((item, index) => (
              <View key={item.key}>
                {index > 0 || (groupIndex === 0 && title) ? (
                  <View style={styles.separator} />
                ) : null}
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
                  <View style={styles.itemText}>
                    <Text tone={item.destructive ? 'danger' : 'primary'} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.subtitle ? (
                      <Text variant="footnote" tone="secondary" numberOfLines={1}>
                        {item.subtitle}
                      </Text>
                    ) : null}
                  </View>
                  {item.checked ? <Icon name="check" color="accent" /> : null}
                  {item.icon ? (
                    <Icon name={item.icon} color={item.destructive ? 'danger' : 'textSecondary'} />
                  ) : null}
                </Pressable>
              </View>
            ))}
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
  /** Text on the trigger beside the icon, for a menu that shows its current choice. */
  label?: string;
  icon?: IconName;
  /** Glyph size of the JS button; the iOS system menu draws its own symbol. */
  iconSize?: number;
  /**
   * Use the system menu where available (iOS). Off by default: a SwiftUI Menu inside React Native
   * lost taps on a device with a live Agent, while a `Button` answers the first one.
   */
  native?: boolean;
  /** Draws the JS trigger in the text color (see `Button`). */
  neutral?: boolean;
  testID?: string;
}

/** A header "more" button that opens an ActionMenu under itself. */
export function ActionMenuButton({
  items,
  accessibilityLabel,
  title,
  label,
  icon = 'more',
  iconSize,
  native = false,
  neutral,
  testID = 'menu-button',
}: ActionMenuButtonProps) {
  const ui = native ? loadSwiftUi() : null;
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
  if (isDeadMenuTrigger(items)) return null;
  if (ui) {
    return (
      <NativeActionMenu
        ui={ui}
        items={items}
        title={title}
        label={label}
        accessibilityLabel={accessibilityLabel}
        icon={icon}
        testID={testID}
      />
    );
  }
  return (
    <View ref={ref} collapsable={false}>
      <Button
        kind="text"
        {...(label === undefined
          ? { icon, accessibilityLabel }
          : { title: label, icon, accessibilityLabel })}
        iconSize={iconSize}
        neutral={neutral}
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
