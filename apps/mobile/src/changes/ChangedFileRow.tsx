import {
  type ChangedFile,
  fileName,
  filePath,
  fileRowDetail,
  kindSymbol,
} from '@openagentspocket/core';
import {
  ActionMenu,
  type ChangeKind,
  ChangeRow,
  copyToClipboard,
  useContextMenu,
} from '@openagentspocket/ui';
import { say } from './say';

interface ChangedFileRowProps {
  file: ChangedFile;
  /** Rows inside an expanded untracked directory sit one level in. */
  depth: 0 | 1;
  /** null: not a directory; else whether its listing is open. */
  expanded: boolean | null;
  onOpen: (file: ChangedFile) => void;
  onToggleDirectory: (file: ChangedFile) => void;
}

/** One uncommitted file: name, directory, line counts and status letter; long press copies the path. */
export function ChangedFileRow({
  file,
  depth,
  expanded,
  onOpen,
  onToggleDirectory,
}: ChangedFileRowProps) {
  const context = useContextMenu();
  const counts = file.lineCounts;
  const lines = counts && file.kind !== 'untracked' && counts.kind === 'lines' ? counts : null;
  const symbol = kindSymbol(file.kind);
  return (
    <>
      <ChangeRow
        file={{
          name: fileName(file),
          dir: fileRowDetail(file, say) ?? undefined,
          added: lines ? Number(lines.added) : undefined,
          removed: lines ? Number(lines.removed) : undefined,
          kind: symbol === '~' ? 'U' : (symbol as ChangeKind),
          expanded: expanded === null ? undefined : expanded,
        }}
        indent={depth === 1}
        onPress={() => (expanded === null ? onOpen(file) : onToggleDirectory(file))}
        onLongPress={context.open}
        testID={`changes-file-${file.path}`}
      />
      <ActionMenu
        title={fileName(file)}
        {...context.menuProps}
        items={[
          {
            key: 'copy-path',
            title: say('Copy Path'),
            icon: 'copy',
            onPress: () => void copyToClipboard(filePath(file), say('Copied')),
          },
        ]}
      />
    </>
  );
}
