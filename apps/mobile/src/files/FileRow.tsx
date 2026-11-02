import {
  type FileBrowserItem,
  formatBytes,
  isNameUsable,
  itemLooksSecret,
} from '@openagentspocket/core';
import { getLocaleTag, t } from '@openagentspocket/i18n';
import { type ActionMenuItem, Badge, Icon, ListRow } from '@openagentspocket/ui';
import { View } from 'react-native';

/** "12 KB · Oct 30"; a folder shows only its date, a link says so. */
export function rowDetail(item: FileBrowserItem): string | undefined {
  const parts: string[] = [];
  if (item.kind === 'file' && item.size !== null) parts.push(formatBytes(item.size));
  if (item.modifiedAt) {
    const date = new Date(item.modifiedAt * 1000);
    parts.push(date.toLocaleDateString(getLocaleTag(), { month: 'short', day: 'numeric' }));
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

/** One entry of the folder on screen: a tap opens or downloads it, a long press opens its actions. */
export function FileRow({ item, dimmed, menu, onOpen }: FileRowProps) {
  const folder = item.kind === 'directory';
  return (
    <View style={{ opacity: dimmed ? 0.5 : 1 }}>
      <ListRow
        title={item.name}
        subtitle={isNameUsable(item) ? rowDetail(item) : t('Name not supported')}
        leading={<Icon name={folder ? 'folder' : 'file'} />}
        trailing={
          itemLooksSecret(item) ? (
            <Badge label={t('May contain secrets')} kind="outline" />
          ) : undefined
        }
        chevron={folder}
        onPress={onOpen}
        menu={menu}
        menuTitle={item.name}
        testID={`file-${item.name}`}
      />
    </View>
  );
}
