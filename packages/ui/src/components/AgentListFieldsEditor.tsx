import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Button } from '../primitives/Button';
import { Card } from '../primitives/Card';
import { Icon } from '../primitives/Icon';
import { MetaChip } from '../primitives/MetaChip';
import { Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';

export interface AgentFieldRow {
  id: string;
  title: string;
  fields: readonly string[];
}

export interface AgentListFieldsLabels {
  /** "Following herdr plugin". */
  subtitle?: string;
  /** Explanation under the rows. */
  footnote: string;
  sync: string;
  reset: string;
  /** Screen-reader label of a row's + button; receives the row title. */
  addField: (rowTitle: string) => string;
}

export const defaultAgentListFieldsLabels: AgentListFieldsLabels = {
  footnote:
    "Row 1 and Row 2 start from herdr's sidebar fields; Sync from plugin refills them. Row 3 is the app's own row. Any row can use herdr and app fields. The status badge always ends Row 1.",
  sync: 'Sync from plugin',
  reset: 'Reset to defaults',
  addField: (rowTitle) => `Add a field to ${rowTitle}`,
};

const useStyles = makeStyles((t) => ({
  root: { gap: t.spacing.md },
  head: { gap: t.spacing.xxs, paddingHorizontal: t.spacing.xs },
  row: {
    gap: t.spacing.xs,
    paddingVertical: t.spacing.sm,
    borderTopWidth: t.metrics.hairlineWidth,
    borderTopColor: t.hairline,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.spacing.xs },
  add: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  actions: { alignItems: 'flex-start', gap: t.spacing.xxs },
}));

interface AgentListFieldsEditorProps {
  host: string;
  rows: readonly AgentFieldRow[];
  /** The `AgentListFieldsPreview` shown in the card above the first row. */
  preview: ReactNode;
  labels?: Partial<AgentListFieldsLabels>;
  onEdit: (rowId: string, field: string) => void;
  onAdd: (rowId: string) => void;
  onSync: () => void;
  onReset?: () => void;
}

/** Settings > Agent list fields for one Host: preview, one chip row per console row, Sync. */
export function AgentListFieldsEditor({
  host,
  rows,
  preview,
  labels,
  onEdit,
  onAdd,
  onSync,
  onReset,
}: AgentListFieldsEditorProps) {
  const styles = useStyles();
  const text = { ...defaultAgentListFieldsLabels, ...labels };
  return (
    <View style={styles.root} testID="agent-list-fields-editor">
      <View style={styles.head}>
        <Text variant="title2" accessibilityRole="header">
          {host}
        </Text>
        {text.subtitle ? (
          <Text variant="subheadline" tone="secondary">
            {text.subtitle}
          </Text>
        ) : null}
      </View>
      <Card>
        {preview}
        {rows.map((row) => (
          <View key={row.id} style={styles.row} testID={`fields-row-${row.id}`}>
            <Text variant="headline">{row.title}</Text>
            <View style={styles.chips}>
              {row.fields.map((field) => (
                <Pressable
                  key={field}
                  onPress={() => onEdit(row.id, field)}
                  accessibilityRole="button"
                  accessibilityLabel={field}
                  testID={`field-chip-${row.id}-${field}`}
                >
                  <MetaChip label={field} />
                </Pressable>
              ))}
              <Pressable
                onPress={() => onAdd(row.id)}
                accessibilityRole="button"
                accessibilityLabel={text.addField(row.title)}
                style={styles.add}
                testID={`field-add-${row.id}`}
              >
                <Icon name="add" size={17} color="accent" />
              </Pressable>
            </View>
          </View>
        ))}
      </Card>
      <Text variant="subheadline" tone="secondary" style={styles.head}>
        {text.footnote}
      </Text>
      <View style={styles.actions}>
        <Button
          kind="text"
          icon="refresh"
          title={text.sync}
          onPress={onSync}
          testID="fields-sync"
        />
        {onReset ? (
          <Button kind="text" title={text.reset} onPress={onReset} testID="fields-reset" />
        ) : null}
      </View>
    </View>
  );
}
