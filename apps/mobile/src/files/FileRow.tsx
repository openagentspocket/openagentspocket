import {
  type FileBrowserItem,
  formatBytes,
  formatDate,
  isNameUsable,
  itemLooksSecret,
} from '@openagentspocket/core';
import { getLocaleTag, t } from '@openagentspocket/i18n';
import {
  type ActionMenuItem,
  FileRow as FileRowView,
  type SwipeAction,
} from '@openagentspocket/ui';

/** "12 KB · Oct 30"; a folder shows only its date, a link says so. */
export function rowDetail(item: FileBrowserItem): string | undefined {
  const parts: string[] = [];
  if (item.kind === 'file' && item.size !== null) parts.push(formatBytes(item.size));
  if (item.modifiedAt) {
    const date = new Date(item.modifiedAt * 1000);
    parts.push(formatDate(date, getLocaleTag(), { dateStyle: 'medium', timeStyle: 'short' }));
  }
  if (item.kind === 'symlink') parts.push(t('link'));
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

interface FileRowProps {
  item: FileBrowserItem;
  dimmed: boolean;
  menu: readonly ActionMenuItem[];
  onOpen: () => void;
}

/** The trailing swipe: Rename and Delete, taken from the long-press menu so both stay in step. */
function swipeFor(menu: readonly ActionMenuItem[]): SwipeAction[] {
  return menu
    .filter((entry) => (entry.key === 'rename' || entry.key === 'delete') && !entry.disabled)
    .map((entry) => ({
      key: entry.key,
      title: entry.title.replace('…', ''),
      icon: entry.icon,
      tone: entry.destructive ? 'danger' : 'accent',
      onPress: entry.onPress,
    }));
}

/** One entry of the folder on screen: a tap opens or downloads it, a long press opens its actions. */
export function FileRow({ item, dimmed, menu, onOpen }: FileRowProps) {
  return (
    <FileRowView
      item={{
        name: item.name,
        kind: item.kind === 'directory' || item.kind === 'symlink' ? item.kind : 'file',
        detail: isNameUsable(item) ? rowDetail(item) : t('Name not supported'),
      }}
      dimmed={dimmed}
      secretLabel={itemLooksSecret(item) ? t('May contain secrets') : undefined}
      menu={menu}
      swipeActions={swipeFor(menu)}
      onPress={onOpen}
    />
  );
}
