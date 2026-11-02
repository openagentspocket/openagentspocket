import { Sheet } from '../overlay/Sheet';
import { Text } from '../primitives/Text';

interface SelectTextSheetProps {
  /** The terminal's visible text (or a whole message); null hides the sheet. */
  text: string | null;
  title: string;
  closeLabel?: string;
  onClose: () => void;
}

/**
 * The "Select Text" sheet: a long-press on the terminal shows its text here in the system's
 * selectable text, since the terminal surface itself cannot select across rows.
 */
export function SelectTextSheet({ text, title, closeLabel, onClose }: SelectTextSheetProps) {
  return (
    <Sheet
      visible={text !== null}
      onClose={onClose}
      title={title}
      closeLabel={closeLabel}
      detent="large"
      testID="select-text-sheet"
    >
      <Text variant="mono" selectable testID="select-text-body">
        {text ?? ''}
      </Text>
    </Sheet>
  );
}
