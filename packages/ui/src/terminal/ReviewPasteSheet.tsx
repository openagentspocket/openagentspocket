import { View } from 'react-native';
import { Sheet } from '../overlay/Sheet';
import { Button } from '../primitives/Button';
import { Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  preview: {
    backgroundColor: t.colors.control,
    borderRadius: t.metrics.cardRadius,
    padding: t.spacing.sm,
  },
  actions: { flexDirection: 'row', gap: t.spacing.xs },
  action: { flex: 1 },
}));

export interface ReviewPasteLabels {
  title: string;
  /** "3 lines, 21 characters". */
  summary: string;
  paste: string;
  cancel: string;
  close?: string;
}

interface ReviewPasteSheetProps {
  /** The text to show, already bounded for display; null hides the sheet. */
  preview: string | null;
  labels: ReviewPasteLabels;
  /** False while no session can take the text (Paste stays disabled, Cancel still works). */
  canConfirm: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** The "Review Paste" sheet: multi-line text waits here until the user confirms it. */
export function ReviewPasteSheet({
  preview,
  labels,
  canConfirm,
  onConfirm,
  onCancel,
}: ReviewPasteSheetProps) {
  const styles = useStyles();
  return (
    <Sheet
      visible={preview !== null}
      onClose={onCancel}
      title={labels.title}
      closeLabel={labels.close}
      testID="review-paste-sheet"
      footer={
        <View style={styles.actions}>
          <View style={styles.action}>
            <Button
              kind="secondary"
              title={labels.cancel}
              onPress={onCancel}
              testID="review-paste-cancel"
            />
          </View>
          <View style={styles.action}>
            <Button
              title={labels.paste}
              onPress={onConfirm}
              disabled={!canConfirm}
              testID="review-paste-confirm"
            />
          </View>
        </View>
      }
    >
      <Text variant="callout" tone="secondary" testID="review-paste-summary">
        {labels.summary}
      </Text>
      <View style={styles.preview}>
        <Text variant="mono" selectable testID="review-paste-preview">
          {preview ?? ''}
        </Text>
      </View>
    </Sheet>
  );
}
