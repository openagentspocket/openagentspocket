import { Sheet } from '../overlay/Sheet';
import { Icon } from '../primitives/Icon';
import { ListRow } from '../primitives/ListRow';
import { Section } from '../primitives/Section';

export interface OptionListItem {
  id: string;
  title: string;
  subtitle?: string;
}

export interface OptionListGroup {
  /** The section header; omitted for a single unlabeled group. */
  title?: string;
  options: readonly OptionListItem[];
}

interface OptionListSheetProps {
  visible: boolean;
  title: string;
  groups: readonly OptionListGroup[];
  onPick: (id: string) => void;
  onClose: () => void;
  cancelLabel?: string;
  testID?: string;
}

/** A sheet that lists grouped options with a "+" each and a Cancel: pick one to add it (fields, peers, keys). */
export function OptionListSheet({
  visible,
  title,
  groups,
  onPick,
  onClose,
  cancelLabel = 'Cancel',
  testID = 'option-list-sheet',
}: OptionListSheetProps) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      detent="large"
      leading={{ label: cancelLabel, onPress: onClose, testID: `${testID}-cancel` }}
      testID={testID}
    >
      {groups.map((group, index) => (
        <Section key={group.title ?? index} title={group.title}>
          {group.options.map((option) => (
            <ListRow
              key={option.id}
              title={option.title}
              subtitle={option.subtitle}
              trailing={<Icon name="add" size={20} color="accent" />}
              onPress={() => onPick(option.id)}
              testID={`${testID}-${option.id}`}
            />
          ))}
        </Section>
      ))}
    </Sheet>
  );
}
