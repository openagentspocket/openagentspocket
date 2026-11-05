import { DEFAULT_AGENT_ROWS, hostDisplayName } from '@openagentspocket/core';
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
import { useAgentFields } from './agentFieldsStore';
import { APP_FIELDS, type FieldDef, HERDR_FIELDS } from './fieldCatalog';

const SYNC_ANCHOR = 'settings.agentFields.sync';

const asOption = (field: FieldDef) => ({
  id: field.id,
  title: field.id,
  subtitle: field.describe(),
});

/** settings.agent-list-fields-host: the live preview and one chip row per console row for a Host. */
export function AgentFieldsHostScreen({ hostId }: { hostId: string }) {
  const { hosts } = useHosts();
  const host = hosts.find((candidate) => candidate.id === hostId);
  const store = useAgentFields();
  const rows = store.rows(hostId);
  const [adding, setAdding] = useState<string | null>(null);
  const name = host ? hostDisplayName(host) : '';
  const rowTitle = (index: number) => t('Row %lld', index + 1);

  const sync = async () => {
    const ok = await confirm({
      title: t("Replace rows with herdr's fields?"),
      message: t("This Host's rows are replaced with its herdr fields and saved right away."),
      confirmLabel: t('Replace Rows'),
      presentation: 'popover',
      anchorKey: SYNC_ANCHOR,
    });
    // No plugin snapshot to read yet: the herdr fields are the defaults.
    if (ok) store.setRows(hostId, DEFAULT_AGENT_ROWS);
  };
  /** What tapping a field offers, as in Swift's chip menu: style, move, remove. */
  const edit = async (rowId: string, field: string) => {
    const row = rows.find((candidate) => candidate.id === rowId);
    const index = row?.fields.indexOf(field) ?? -1;
    const dimmed = row?.dim?.includes(field) ?? false;
    const choice = await confirm({
      title: field,
      actions: [
        { key: 'style', title: dimmed ? t('Default Style') : t('Secondary Style') },
        ...(index > 0 ? [{ key: 'left', title: t('Move Left') }] : []),
        ...(row && index >= 0 && index < row.fields.length - 1
          ? [{ key: 'right', title: t('Move Right') }]
          : []),
        { key: 'remove', title: t('Remove'), destructive: true },
      ],
    });
    if (choice === 'style') store.toggleStyle(hostId, rowId, field);
    else if (choice === 'left') store.moveField(hostId, rowId, field, -1);
    else if (choice === 'right') store.moveField(hostId, rowId, field, 1);
    else if (choice === 'remove') store.removeField(hostId, rowId, field);
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
        syncAnchorKey={SYNC_ANCHOR}
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
          if (adding) store.addField(hostId, adding, field);
          setAdding(null);
        }}
        testID="add-field-sheet"
      />
    </Screen>
  );
}
