import type { AccessibilityActionEvent } from 'react-native';
import type { ActionMenuItem } from './ActionMenu';
import { useContextMenu } from './useContextMenu';

interface RowAction {
  readonly key: string;
  readonly title: string;
  readonly onPress: () => void;
}

/**
 * A row's long-press menu and what a screen reader gets for it. `menu` opens on long press; `extra`
 * (swipe actions) only joins the screen-reader actions. An action in both is offered once.
 */
export function useRowMenu(
  menu: readonly ActionMenuItem[] | undefined,
  ...extra: readonly (readonly RowAction[] | undefined)[]
) {
  const context = useContextMenu();
  const actions = [...extra.flatMap((list) => list ?? []), ...(menu ?? [])].filter(
    (action, index, all) => all.findIndex((other) => other.key === action.key) === index,
  );
  return {
    /** Spread on the ActionMenu. */
    menuProps: context.menuProps,
    /** Undefined without a menu, so the row keeps its own long press. */
    onLongPress: menu?.length ? context.open : undefined,
    /** Spread on the pressable. */
    a11y: {
      accessibilityActions: actions.map((action) => ({ name: action.key, label: action.title })),
      onAccessibilityAction: (event: AccessibilityActionEvent) =>
        actions.find((action) => action.key === event.nativeEvent.actionName)?.onPress(),
    },
  };
}
