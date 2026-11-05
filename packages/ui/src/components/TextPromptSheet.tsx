import { useEffect, useState } from 'react';
import { TextField } from '../form/TextField';
import { Sheet } from '../overlay/Sheet';
import { Text } from '../primitives/Text';

interface TextPromptSheetProps {
  visible: boolean;
  title: string;
  /** The field's label and the initial text it opens with. */
  fieldLabel: string;
  initialValue?: string;
  /** A footnote under the field. */
  hint?: string;
  cancelLabel?: string;
  saveLabel?: string;
  onSave: (value: string) => void;
  onClose: () => void;
  testID?: string;
}

/** A sheet that asks for one line of text (Rename): Cancel and Save in the bar, a hint under the field. */
export function TextPromptSheet({
  visible,
  title,
  fieldLabel,
  initialValue = '',
  hint,
  cancelLabel = 'Cancel',
  saveLabel = 'Save',
  onSave,
  onClose,
  testID = 'text-prompt',
}: TextPromptSheetProps) {
  const [value, setValue] = useState(initialValue);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset whenever the sheet opens
  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible]);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      detent="fit"
      leading={{ label: cancelLabel, onPress: onClose, testID: `${testID}-cancel` }}
      trailing={{ label: saveLabel, onPress: () => onSave(value), testID: `${testID}-save` }}
      testID={testID}
    >
      <TextField
        label={fieldLabel}
        value={value}
        onChangeText={setValue}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => onSave(value)}
        testID={`${testID}-field`}
      />
      {hint ? (
        <Text variant="footnote" tone="secondary">
          {hint}
        </Text>
      ) : null}
    </Sheet>
  );
}
