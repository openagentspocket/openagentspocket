import type { ActionMenuItem } from './ActionMenu';

export interface MenuGroup {
  title?: string;
  items: ActionMenuItem[];
}

/**
 * Splits items into groups the way the Swift menus read: a new titled `section` starts one, and a
 * destructive item starts an untitled one after non-destructive items (the divider before Close).
 */
export function groupMenuItems(items: readonly ActionMenuItem[]): MenuGroup[] {
  const groups: MenuGroup[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    const startsSection = item.section !== undefined;
    const startsDestructive = item.destructive && last?.items.some((i) => !i.destructive);
    if (!last || startsSection || startsDestructive) {
      groups.push({ title: item.section, items: [item] });
    } else {
      last.items.push(item);
    }
  }
  return groups;
}

/**
 * Whether a button that opens `items` (or runs `onPress`) would do nothing: no items and no
 * press handler. Menu triggers render nothing then, so a dead button can never ship.
 */
export function isDeadMenuTrigger(
  items: readonly unknown[] | undefined,
  onPress?: (() => void) | undefined,
): boolean {
  return (items === undefined || items.length === 0) && onPress === undefined;
}
