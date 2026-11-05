import { t } from '@openagentspocket/i18n';
import { Icon, ListRow, Section, Sheet } from '@openagentspocket/ui';
import { APP_FIELDS, type FieldDef, HERDR_FIELDS } from './fieldCatalog';

interface Props {
  visible: boolean;
  /** 1-based number of the row being added to. */
  rowNumber: number;
  onClose: () => void;
  onPick: (field: string) => void;
}

/** settings.agent-list-fields-add-field: every field a row can take, herdr's first. */
export function AddFieldSheet({ visible, rowNumber, onClose, onPick }: Props) {
  const group = (title: string, fields: readonly FieldDef[]) => (
    <Section title={title}>
      {fields.map((field) => (
        <ListRow
          key={field.id}
          title={field.id}
          subtitle={field.describe()}
          trailing={<Icon name="add" size={20} color="accent" />}
          onPress={() => onPick(field.id)}
          testID={`add-field-${field.id}`}
        />
      ))}
    </Section>
  );
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('Add to Row %lld', rowNumber)}
      detent="large"
      leading={{ label: t('Cancel'), onPress: onClose, testID: 'add-field-cancel' }}
      testID="add-field-sheet"
    >
      {group(t('herdr fields'), HERDR_FIELDS)}
      {group(t('Agentico fields'), APP_FIELDS)}
    </Sheet>
  );
}
