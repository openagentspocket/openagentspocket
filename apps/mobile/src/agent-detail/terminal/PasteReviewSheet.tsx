import type { PasteReview } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, makeStyles, Sheet, Text } from '@openagentspocket/ui';
import { View } from 'react-native';

const useStyles = makeStyles((th) => ({
  body: { gap: th.spacing.sm, padding: th.spacing.md },
  actions: { flexDirection: 'row', gap: th.spacing.sm, padding: th.spacing.md },
  action: { flex: 1 },
}));

interface Props {
  review: PasteReview | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Multiline clipboard text is shown before it reaches the pane; Cancel is the safe default. */
export function PasteReviewSheet({ review, onConfirm, onCancel }: Props) {
  const styles = useStyles();
  return (
    <Sheet
      visible={review !== null}
      onClose={onCancel}
      title={t('Review Paste')}
      detent="medium"
      testID="paste-review"
      footer={
        <View style={styles.actions}>
          <View style={styles.action}>
            <Button title={t('Cancel')} kind="secondary" onPress={onCancel} testID="paste-cancel" />
          </View>
          <View style={styles.action}>
            <Button title={t('Paste')} onPress={onConfirm} testID="paste-confirm" />
          </View>
        </View>
      }
    >
      {review ? (
        <View style={styles.body}>
          <Text variant="caption" tone="secondary">
            {t('%lld lines, %lld characters', review.lineCount, review.characterCount)}
          </Text>
          <Text variant="mono" testID="paste-preview">
            {review.preview}
          </Text>
        </View>
      ) : null}
    </Sheet>
  );
}
