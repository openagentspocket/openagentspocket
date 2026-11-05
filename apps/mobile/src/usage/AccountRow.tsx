import { DEFAULT_ACCOUNT_ID } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { ListRow, useAnchor } from '@openagentspocket/ui';
import { View } from 'react-native';
import { RenameField } from './RenameField';

/** The key a Remove Account popover points at. */
export const accountAnchor = (id: string) => `account-row-${id}`;

interface Props {
  id: string;
  name: string;
  directory: string | null;
  stateLine?: string;
  renaming: boolean;
  busy: boolean;
  onStartRename: () => void;
  onCancelRename: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
}

/** One Claude Code Account: a row with a Rename/Remove menu, or its name field while renaming. */
export function AccountRow(props: Props) {
  const { id, name, directory, stateLine, renaming, busy } = props;
  const anchor = useAnchor(accountAnchor(id));
  if (renaming) {
    return (
      <RenameField
        initial={name}
        busy={busy}
        onCancel={props.onCancelRename}
        onSave={props.onRename}
      />
    );
  }
  return (
    <View ref={anchor} collapsable={false}>
      <ListRow
        title={name}
        subtitle={directory ?? undefined}
        value={stateLine}
        menu={[
          { key: 'rename', title: t('Rename Account'), icon: 'edit', onPress: props.onStartRename },
          ...(id === DEFAULT_ACCOUNT_ID
            ? []
            : [
                {
                  key: 'remove',
                  title: t('Remove Account'),
                  icon: 'trash' as const,
                  destructive: true,
                  onPress: props.onRemove,
                },
              ]),
        ]}
        testID={`account-${id}`}
      />
    </View>
  );
}
