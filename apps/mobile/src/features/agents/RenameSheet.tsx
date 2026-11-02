import type { ConsoleRow } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, Sheet, TextField } from '@openagentspocket/ui';
import { useEffect, useState } from 'react';

interface RenameSheetProps {
  /** The Agent being renamed; undefined keeps the sheet closed. */
  row: ConsoleRow | undefined;
  onClose: () => void;
  onSave: (row: ConsoleRow, name: string) => void;
}

/** Names an Agent. Saving an empty name gives it back its own. */
export function RenameSheet({ row, onClose, onSave }: RenameSheetProps) {
  const [name, setName] = useState('');
  const paneId = row?.agent.pane_id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when another Agent opens
  useEffect(() => {
    setName(row?.agent.name ?? '');
  }, [paneId]);
  return (
    <Sheet
      visible={row !== undefined}
      onClose={onClose}
      title={t('Rename Agent')}
      detent="medium"
      footer={
        <Button title={t('Save')} testID="rename-save" onPress={() => row && onSave(row, name)} />
      }
    >
      <TextField
        label={t('Name')}
        value={name}
        onChangeText={setName}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => row && onSave(row, name)}
        testID="rename-field"
      />
    </Sheet>
  );
}
