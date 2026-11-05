import type { ConsoleRow } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { TextPromptSheet } from '@openagentspocket/ui';

/** What a rename names: an Agent (an empty name falls back to its detected kind) or its Workspace (a label is required). */
export type RenameSubject = 'agent' | 'workspace';

interface RenameSheetProps {
  /** The Agent being renamed, or whose Workspace is; undefined keeps the sheet closed. */
  row: ConsoleRow | undefined;
  subject?: RenameSubject;
  onClose: () => void;
  onSave: (row: ConsoleRow, name: string) => void;
}

/** Names an Agent or its Workspace: one sheet for both renames, as Swift's RenameStore. */
export function RenameSheet({ row, subject = 'agent', onClose, onSave }: RenameSheetProps) {
  const workspace = subject === 'workspace';
  return (
    <TextPromptSheet
      visible={row !== undefined}
      title={workspace ? t('Rename Workspace') : t('Rename Agent')}
      fieldLabel={t('Name')}
      initialValue={(workspace ? row?.workspaceLabel : row?.agent.name) ?? ''}
      hint={
        workspace
          ? undefined
          : t('Leave empty to fall back to the detected kind (%@).', row?.agent.agent ?? '')
      }
      cancelLabel={t('Cancel')}
      saveLabel={t('Save')}
      onSave={(name) => row && (!workspace || name.trim() !== '') && onSave(row, name)}
      onClose={onClose}
      testID="rename"
    />
  );
}
