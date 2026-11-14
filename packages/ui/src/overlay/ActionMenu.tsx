import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, useWindowDimensions, View } from 'react-native';
import { Button } from '../primitives/Button';
import { Icon, type IconName } from '../primitives/Icon';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { rounded } from '../theme/corners';
import { useInsets } from '../theme/insets';
import { makeStyles, useTheme } from '../theme/theme';
import { MENU_DISMISS_MS } from './dismiss';
import { groupMenuItems, isDeadMenuTrigger } from './menuGroups';
import { placePopover } from './menuPlacement';
import { loadSwiftUi, NativeActionMenu } from './NativeActionMenu';
import { useMenuTrigger } from './useMenuTrigger';

export type { MenuGroup } from './menuGroups';
export { groupMenuItems, isDeadMenuTrigger, MENU_DISMISS_MS };

/** A subtitle's or a section title's line, for placing the menu before it is measured. */
const LINE_HEIGHT = 20;

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
  /** What a screen reader says when the title is a short form of it ("Commit and PR"). */
  accessibilityLabel?: string;
  onPress: () => void;
}

/** A trigger's frame in window coordinates; the menu opens under it (or above, near the bottom). */
export interface MenuAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MENU_WIDTH = 250;

const useStyles = makeStyles((t) => ({
  backdrop: { flex: 1, backgroundColor: t.backdrop },
  panel: {
    backgroundColor: t.colors.surfaceOverlay,
    ...rounded(t.radius.control),
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    overflow: 'hidden',
  },
  popover: { position: 'absolute' },
  title: { paddingHorizontal: t.spacing.md, paddingTop: t.spacing.sm, paddingBottom: t.spacing.xs },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    minHeight: t.metrics.minTapSize,
    paddingHorizontal: t.spacing.md,
  },
  liftedItem: { minHeight: t.metrics.rowMinHeight },
  separator: { height: t.metrics.hairlineWidth, backgroundColor: t.hairline },
  divider: { marginHorizontal: t.spacing.md },
  groupGap: { height: 6, backgroundColor: t.colors.separator },
  sectionTitle: {
    paddingHorizontal: t.spacing.md,
    paddingTop: t.spacing.xs,
    paddingBottom: t.spacing.xxs,
  },
  itemText: { flex: 1 },
  liftedIcon: { width: 24, alignItems: 'center' },
  pressed: { backgroundColor: t.colors.surfaceRaised },
  disabled: { opacity: 0.4 },
  stage: {
    ...({ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } as const),
    justifyContent: 'center',
    paddingHorizontal: t.spacing.md,
    gap: t.spacing.sm,
  },
  inline: { gap: t.spacing.sm, paddingHorizontal: t.spacing.md },
  lifted: { gap: t.spacing.sm },
  liftedMenu: { alignSelf: 'flex-start', minWidth: MENU_WIDTH },
}));

interface ActionMenuProps {
  items: readonly ActionMenuItem[];
  visible: boolean;
  onClose: () => void;
  title?: string;
  anchor?: MenuAnchor;
  /**
   * The pressed card, lifted at its own width above a raised menu (accent icons, destructive
   * actions below a divider): the long-press look and the popover fallback of a native preview.
   */
  preview?: ReactNode;
  /** With a preview: draw in place instead of a Modal (the gallery and tests). */
  inline?: boolean;
  /** Menu width; a compact popover passes less than the default. */
  width?: number;
  /** Runs when the menu appears (the long-press haptic). */
  onOpen?: () => void;
  /** The menu is gone and its chosen item ran: a trigger may unmount now, not before. */
  onClosed?: () => void;
  testID?: string;
}

/** The one menu (context menu, popover, header "more", lifted card). An item closes it, then runs. */
export function ActionMenu({
  items,
  visible,
  onClose,
  title,
  anchor,
  preview,
  inline = false,
  width = MENU_WIDTH,
  onOpen,
  onClosed,
  testID = 'action-menu',
}: ActionMenuProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useInsets();
  const window = useWindowDimensions();
  const [liftedHeight, setLiftedHeight] = useState(0);
  const pending = useRef<(() => void) | null>(null);
  const wasVisible = useRef(false);
  const callbacks = useRef({ onOpen, onClosed });
  callbacks.current = { onOpen, onClosed };
  // A trigger forgets its anchor on close; the menu fades out where it stood, not at the default spot.
  const lastAnchor = useRef(anchor);
  if (anchor) lastAnchor.current = anchor;
  const shown = anchor ?? lastAnchor.current;

  useEffect(() => {
    if (visible) {
      wasVisible.current = true;
      callbacks.current.onOpen?.();
      return;
    }
    if (!wasVisible.current) return;
    wasVisible.current = false;
    const run = pending.current;
    pending.current = null;
    const timer = setTimeout(() => {
      run?.();
      callbacks.current.onClosed?.();
    }, MENU_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  const lifted = preview !== undefined;
  const renderItem = (item: ActionMenuItem) => (
    <Tappable
      key={item.key}
      accessibilityRole="menuitem"
      accessibilityLabel={item.accessibilityLabel ?? item.title}
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
        lifted && styles.liftedItem,
        pressed && styles.pressed,
        item.disabled && styles.disabled,
      ]}
      testID={`${testID}-${item.key}`}
    >
      {lifted ? (
        <View style={styles.liftedIcon}>
          {item.icon ? (
            <Icon name={item.icon} size={20} color={item.destructive ? 'danger' : 'accent'} />
          ) : null}
        </View>
      ) : null}
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
      {item.icon && !lifted ? (
        <Icon name={item.icon} color={item.destructive ? 'danger' : 'textSecondary'} />
      ) : null}
    </Tappable>
  );

  const margin = theme.spacing.xs;
  let body: ReactNode;
  if (lifted) {
    const regular = items.filter((item) => !item.destructive);
    const destructive = items.filter((item) => item.destructive);
    const lowest = window.height - insets.bottom - margin - liftedHeight;
    const placed = shown
      ? {
          justifyContent: 'flex-start' as const,
          paddingTop: Math.max(insets.top + margin, Math.min(shown.y - liftedHeight / 2, lowest)),
          opacity: liftedHeight > 0 ? 1 : 0,
        }
      : undefined;
    body = (
      <View style={inline ? styles.inline : [styles.stage, placed]} pointerEvents="box-none">
        <View
          style={styles.lifted}
          pointerEvents="box-none"
          onLayout={(event) => setLiftedHeight(event.nativeEvent.layout.height)}
        >
          <View testID={`${testID}-preview`} pointerEvents="none">
            {preview}
          </View>
          <View style={[styles.panel, styles.liftedMenu]} accessibilityViewIsModal testID={testID}>
            {regular.map(renderItem)}
            {regular.length > 0 && destructive.length > 0 ? (
              <View style={[styles.separator, styles.divider]} />
            ) : null}
            {destructive.map(renderItem)}
          </View>
        </View>
      </View>
    );
    if (inline) return visible ? body : null;
  } else {
    // A subtitle and a section title each add a line; the panel scrolls past the room it gets.
    const lines = items.filter((item) => item.subtitle).length + groupMenuItems(items).length;
    const estimated =
      items.length * theme.metrics.minTapSize + lines * LINE_HEIGHT + (title ? 40 : 0);
    const position = placePopover({
      anchor: shown,
      width,
      estimated,
      window,
      insets,
      margin,
      gap: theme.spacing.xxs,
      fallbackBottom: theme.spacing.lg,
    });
    body = (
      <View
        style={[styles.panel, styles.popover, { width }, position]}
        accessibilityViewIsModal
        testID={testID}
      >
        {title ? (
          <Text variant="footnote" tone="secondary" style={styles.title} accessibilityRole="header">
            {title}
          </Text>
        ) : null}
        <ScrollView bounces={false} testID={`${testID}-scroll`}>
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
                  {renderItem(item)}
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Tappable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityElementsHidden
        importantForAccessibility="no"
        testID={`${testID}-backdrop`}
      />
      {body}
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
  /** True as the menu opens, false once it is gone and its item ran. JS menu only. */
  onOpenChange?: (open: boolean) => void;
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
  onOpenChange,
  testID = 'menu-button',
}: ActionMenuButtonProps) {
  const ui = native ? loadSwiftUi() : null;
  const trigger = useMenuTrigger();
  const [menu, setMenu] = useState<{ anchor?: MenuAnchor } | null>(null);
  const open = () => {
    onOpenChange?.(true);
    trigger.measure((anchor) => setMenu({ anchor }));
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
    <View ref={trigger.ref} collapsable={false} onTouchStart={trigger.onTouchStart}>
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
        onClosed={() => onOpenChange?.(false)}
      />
    </View>
  );
}
