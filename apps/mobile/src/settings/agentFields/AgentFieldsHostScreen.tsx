import { hostDisplayName } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  AgentListFieldsEditor,
  AgentListFieldsPreview,
  confirm,
  OptionListSheet,
  Screen,
} from '@openagentspocket/ui';
import { useState } from 'react';
import { useHosts } from '@/features/hosts/useHosts';
import { APP_FIELDS, DEFAULT_ROWS, type FieldDef, HERDR_FIELDS } from './fieldCatalog';
import { addField, removeField, setAgentRows, useAgentRows } from './useAgentFields';

const asOption = (field: FieldDef) => ({
  id: field.id,
  title: field.id,
  subtitle: field.describe(),
});

/** settings.agent-list-fields-host: the live preview and one chip row per console row for a Host. */
export function AgentFieldsHostScreen({ hostId }: { hostId: string }) {
  const { hosts } = useHosts();
  const host = hosts.find((candidate) => candidate.id === hostId);
  const rows = useAgentRows(hostId);
  const [adding, setAdding] = useState<string | null>(null);
  const name = host ? hostDisplayName(host) : '';
  const rowTitle = (index: number) => t('Row %lld', index + 1);

  const sync = async () => {
    const ok = await confirm({
      title: t("Replace rows with herdr's fields?"),
      message: t("This Host's rows are replaced with its herdr fields and saved right away."),
      confirmLabel: t('Replace Rows'),
      presentation: 'dialog',
    });
    // No plugin snapshot to read yet: the herdr fields are the defaults.
    if (ok) setAgentRows(hostId, DEFAULT_ROWS);
  };
  const edit = async (rowId: string, field: string) => {
    const choice = await confirm({
      title: field,
      actions: [{ key: 'remove', title: t('Remove'), destructive: true }],
    });
    if (choice === 'remove') removeField(hostId, rowId, field);
  };
  const addingIndex = rows.findIndex((row) => row.id === adding);
  return (
    <Screen edges={['left', 'right']} testID="settings-agent-fields-host">
      <AgentListFieldsEditor
        host={name}
        labels={{
          subtitle: t('Following herdr plugin'),
          footnote: t(
            "Row 1 and Row 2 start from herdr's sidebar fields; Sync from plugin refills them. Row 3 is Agentico's own row. Any row can use herdr and Agentico fields. The status badge always ends Row 1.",
          ),
          sync: t('Sync from plugin'),
          addField: (title) =>
            t('Add field to Row %lld', Number.parseInt(title.replace(/\D/g, ''), 10)),
        }}
        rows={rows.map((row, index) => ({
          id: row.id,
          title: rowTitle(index),
          fields: row.fields,
        }))}
        preview={
          <AgentListFieldsPreview
            hostName={name}
            fields={rows.flatMap((row) => row.fields)}
            labels={{ caption: t('Console Preview') }}
          />
        }
        onEdit={(rowId, field) => void edit(rowId, field)}
        onAdd={setAdding}
        onSync={() => void sync()}
      />
      <OptionListSheet
        visible={adding !== null}
        title={t('Add to Row %lld', addingIndex + 1)}
        cancelLabel={t('Cancel')}
        groups={[
          { title: t('herdr fields'), options: HERDR_FIELDS.map(asOption) },
          { title: t('Agentico fields'), options: APP_FIELDS.map(asOption) },
        ]}
        onClose={() => setAdding(null)}
        onPick={(field) => {
          if (adding) addField(hostId, adding, field);
          setAdding(null);
        }}
        testID="add-field-sheet"
      />
    </Screen>
  );
}
