import {
  type ChangedFile,
  fileDetail,
  fileName,
  filePath,
  fileRowDetail,
  kindSymbol,
  lineCountsSummary,
} from '@openagentspocket/core';
import { Badge, copyToClipboard, Icon, ListRow, makeStyles, Text } from '@openagentspocket/ui';
import { View } from 'react-native';
import { say } from './say';

const useStyles = makeStyles((t) => ({
  nested: { paddingLeft: t.spacing.lg },
  // One width for every change letter, so names start on the same edge in every row.
  kind: { width: 36, alignItems: 'center' },
  // One width and right edge for the line counts, so the deltas stack in a column.
  delta: { minWidth: 92, alignItems: 'flex-end' },
}));

interface ChangedFileRowProps {
  file: ChangedFile;
  /** Rows inside an expanded untracked directory sit one level in. */
  depth: 0 | 1;
  /** null: not a directory; else whether its listing is open. */
  expanded: boolean | null;
  onOpen: (file: ChangedFile) => void;
  onToggleDirectory: (file: ChangedFile) => void;
}

/** One uncommitted file: change letter, name, rename source or directory, and its line counts. */
export function ChangedFileRow({
  file,
  depth,
  expanded,
  onOpen,
  onToggleDirectory,
}: ChangedFileRowProps) {
  const styles = useStyles();
  const counts = file.lineCounts;
  const detail = fileRowDetail(file, say);
  const label = `${filePath(file)}, ${fileDetail(file, say)}${
    counts && file.kind !== 'untracked' ? `, ${lineCountsSummary(counts, say)}` : ''
  }`;
  const row = (
    <ListRow
      testID={`changes-file-${file.path}`}
      title={fileName(file)}
      subtitle={detail ?? undefined}
      accessibilityLabel={label}
      leading={
        <View style={styles.kind}>
          <Badge
            label={kindSymbol(file.kind)}
            kind={file.kind === 'conflicted' ? 'accent' : 'control'}
          />
        </View>
      }
      trailing={
        expanded !== null ? (
          <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={12} />
        ) : counts && file.kind !== 'untracked' ? (
          <View style={styles.delta}>
            <Text variant="caption" tone="secondary">
              {lineCountsSummary(counts, say)}
            </Text>
          </View>
        ) : undefined
      }
      chevron={expanded === null}
      onPress={() => (expanded === null ? onOpen(file) : onToggleDirectory(file))}
      menu={[
        {
          key: 'copy-path',
          title: say('Copy Path'),
          icon: 'copy',
          onPress: () => void copyToClipboard(filePath(file), say('Copied')),
        },
      ]}
    />
  );
  return depth === 0 ? row : <View style={styles.nested}>{row}</View>;
}
