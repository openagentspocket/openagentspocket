import type { ConsoleRow } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { TextPromptSheet } from '@openagentspocket/ui';

interface RenameSheetProps {
  /** The Agent being renamed; undefined keeps the sheet closed. */
  row: ConsoleRow | undefined;
  onClose: () => void;
  onSave: (row: ConsoleRow, name: string) => void;
}

/** Names an Agent. Saving an empty name gives it back its own. */
export function RenameSheet({ row, onClose, onSave }: RenameSheetProps) {
  return (
    <TextPromptSheet
      visible={row !== undefined}
      title={t('Rename Agent')}
      fieldLabel={t('Name')}
      initialValue={row?.agent.name ?? ''}
      hint={t('Leave empty to fall back to the detected kind (%@).', row?.agent.agent ?? '')}
      cancelLabel={t('Cancel')}
      saveLabel={t('Save')}
      onSave={(name) => row && onSave(row, name)}
      onClose={onClose}
      testID="rename"
    />
  );
}
