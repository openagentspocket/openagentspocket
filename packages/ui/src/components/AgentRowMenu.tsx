import { type ReactNode, useEffect, useRef } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { impact } from '../haptics';
import { type ActionMenuItem, MENU_DISMISS_MS } from '../overlay/ActionMenu';
import { Icon } from '../primitives/Icon';
import type { SwipeAction } from '../primitives/SwipeRow';
import { Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';
import { type AgentRowLabels, defaultAgentRowLabels } from './agentRowLabels';

const useStyles = makeStyles((t) => ({
  backdrop: { flex: 1, backgroundColor: t.backdrop },
  stage: {
    ...({ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } as const),
    justifyContent: 'center',
    paddingHorizontal: t.spacing.md,
    gap: t.spacing.sm,
  },
  inline: { gap: t.spacing.sm, paddingHorizontal: t.spacing.md },
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

interface AgentRowMenuProps {
  /** The pressed row, kept visible at its own width above the menu. */
  preview: ReactNode;
  items: readonly ActionMenuItem[];
  visible: boolean;
  onClose: () => void;
  /** Draws in place instead of a Modal (the gallery and tests). */
  inline?: boolean;
  testID?: string;
}

/**
 * The long-press menu of an Agent row: the row lifts at full width above a raised menu
 * (accent icons; destructive actions in red below a divider). An item closes the menu, then runs.
 */
export function AgentRowMenu({
  preview,
  items,
  visible,
  onClose,
  inline = false,
  testID = 'agent-row-menu',
}: AgentRowMenuProps) {
  const styles = useStyles();
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (visible) {
      impact('medium');
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
    <Pressable
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
    </Pressable>
  );
  const stage = (
    <View style={inline ? styles.inline : styles.stage} pointerEvents="box-none">
      <View testID={`${testID}-preview`} pointerEvents="none">
        {preview}
      </View>
      <View style={styles.menu} accessibilityViewIsModal testID={testID}>
        {regular.map(renderItem)}
        {regular.length > 0 && destructive.length > 0 ? <View style={styles.divider} /> : null}
        {destructive.map(renderItem)}
      </View>
    </View>
  );
  if (inline) return visible ? stage : null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
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

interface AgentRowActionsInput {
  pinned?: boolean;
  onPin?: () => void;
  onDetails?: () => void;
  onClose?: () => void;
  labels?: AgentRowLabels;
}

export interface AgentRowActions {
  /** Long-press menu (Pin, Details, Close Pane), also the accessibility actions. */
  menu: ActionMenuItem[];
  /** Swipe right: Pin. */
  leading: SwipeAction[];
  /** Swipe left: Close. */
  trailing: SwipeAction[];
}

/** The three actions every Agent row offers, in the menu and as swipes. */
export function agentRowActions({
  pinned = false,
  onPin,
  onDetails,
  onClose,
  labels = defaultAgentRowLabels,
}: AgentRowActionsInput): AgentRowActions {
  const pinTitle = pinned ? labels.unpin : labels.pin;
  const menu: ActionMenuItem[] = [];
  if (onPin) menu.push({ key: 'pin', title: pinTitle, icon: 'pin', onPress: onPin });
  if (onDetails)
    menu.push({ key: 'details', title: labels.details, icon: 'info', onPress: onDetails });
  if (onClose)
    menu.push({
      key: 'close',
      title: labels.closePane,
      icon: 'trash',
      destructive: true,
      onPress: onClose,
    });
  return {
    menu,
    leading: onPin
      ? [{ key: 'pin', title: pinTitle, icon: 'pin', tone: 'accent', onPress: onPin }]
      : [],
    trailing: onClose
      ? [{ key: 'close', title: labels.close, icon: 'trash', tone: 'danger', onPress: onClose }]
      : [],
  };
}
