import { View } from 'react-native';
import type { ActionMenuItem } from '../overlay/ActionMenu';
import { Badge } from '../primitives/Badge';
import { Icon } from '../primitives/Icon';
import { ListRow } from '../primitives/ListRow';
import type { SwipeAction } from '../primitives/SwipeRow';
import { makeStyles } from '../theme/theme';

const useStyles = makeStyles(() => ({
  glyph: { width: 28, alignItems: 'center' },
  dimmed: { opacity: 0.5 },
}));

export type FileRowKind = 'directory' | 'file' | 'symlink';

export interface FileRowItem {
  name: string;
  kind: FileRowKind;
  /** "40 bytes - 22 Sep 2026 at 09:00": already formatted, set in monospaced caption. */
  detail?: string;
}

interface FileRowProps {
  item: FileRowItem;
  /** An entry that cannot be opened here draws at half strength. */
  dimmed?: boolean;
  /** A tag after the name, such as "May contain secrets". */
  secretLabel?: string;
  /** Long press: Download, Rename, Delete. */
  menu?: readonly ActionMenuItem[];
  /** Swipe: Delete. */
  swipeActions?: readonly SwipeAction[];
  onPress: () => void;
  testID?: string;
}

/**
 * One entry of a folder: an accent glyph for folders and a secondary one for files, the name, a
 * monospaced caption and a chevron on folders. Transparent: group rows in one card with hairlines.
 */
export function FileRow({
  item,
  dimmed = false,
  secretLabel,
  menu,
  swipeActions,
  onPress,
  testID,
}: FileRowProps) {
  const styles = useStyles();
  const folder = item.kind === 'directory';
  return (
    <View style={dimmed ? styles.dimmed : undefined}>
      <ListRow
        title={item.name}
        subtitle={item.detail}
        subtitleMono
        leading={
          <View style={styles.glyph}>
            <Icon
              name={folder ? 'folder' : 'file'}
              size={24}
              color={folder ? 'accent' : 'textSecondary'}
            />
          </View>
        }
        trailing={secretLabel ? <Badge label={secretLabel} kind="outline" /> : undefined}
        chevron={folder}
        onPress={onPress}
        menu={menu}
        menuTitle={item.name}
        swipeActions={swipeActions}
        testID={testID ?? `file-${item.name}`}
      />
    </View>
  );
}
