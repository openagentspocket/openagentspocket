import type { FileBrowserItem } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, Sheet, Text, TextField } from '@openagentspocket/ui';
import { useEffect, useState } from 'react';

interface RenameSheetProps {
  item: FileBrowserItem | null;
  onClose: () => void;
  onRename: (item: FileBrowserItem, newName: string) => void;
}

/** The rename prompt: a field seeded with the current name; an existing name is never replaced. */
export function RenameSheet({ item, onClose, onRename }: RenameSheetProps) {
  const [name, setName] = useState('');
  useEffect(() => {
    if (item) setName(item.name);
  }, [item]);
  const submit = () => {
    if (!item) return;
    onClose();
    onRename(item, name);
  };
  return (
    <Sheet
      visible={item !== null}
      onClose={onClose}
      title={t('Rename')}
      detent="fit"
      footer={<Button title={t('Rename')} onPress={submit} testID="rename-confirm" />}
    >
      <Text tone="secondary">
        {item ? t('A new name for "%@". An existing name is never replaced.', item.name) : ''}
      </Text>
      <TextField
        label={t('Name')}
        value={name}
        onChangeText={setName}
        autoCapitalize="none"
        autoCorrect={false}
        selectTextOnFocus
        returnKeyType="done"
        onSubmitEditing={submit}
        testID="rename-field"
      />
    </Sheet>
  );
}
