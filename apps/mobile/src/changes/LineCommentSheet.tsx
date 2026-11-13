import { type CommentedLine, quotedLine } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, makeStyles, Sheet, Text, TextField } from '@openagentspocket/ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

const useStyles = makeStyles((th) => ({
  line: { gap: th.spacing.xxs },
}));

interface LineCommentSheetProps {
  visible: boolean;
  /** The line being commented on; it outlives `visible` while the sheet slides away. */
  line: CommentedLine | undefined;
  /** Receives the typed comment; the owner hands it to the Agent's Composer. */
  onAdd: (comment: string) => void;
  onClose: () => void;
  onDismissed?: () => void;
}

/** line-comment: which line (file, number, its text), the comment, and Add to Composer. */
export function LineCommentSheet({
  visible,
  line,
  onAdd,
  onClose,
  onDismissed,
}: LineCommentSheetProps) {
  const styles = useStyles();
  const [comment, setComment] = useState('');
  useEffect(() => {
    if (visible) setComment('');
  }, [visible]);
  const blank = comment.trim() === '';
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onDismissed={onDismissed}
      title={t('Comment on Line')}
      closeLabel={t('Close')}
      detent="large"
      footer={
        <Button
          title={t('Add to Composer')}
          icon="chat"
          disabled={blank}
          onPress={() => onAdd(comment)}
          testID="line-comment-add"
        />
      }
      testID="line-comment-sheet"
    >
      {line ? (
        <View style={styles.line} testID="line-comment-line">
          <Text variant="footnote" tone="secondary" monospaced numberOfLines={2}>
            {line.path}
          </Text>
          <Text variant="subheadline" semibold>
            {line.removed
              ? t('Removed line %@', String(line.number))
              : t('Line %@', String(line.number))}
          </Text>
          <Text variant="mono" numberOfLines={3}>
            {quotedLine(line.text)}
          </Text>
        </View>
      ) : null}
      <TextField
        label={t('Comment')}
        hint={t('Added to the Composer with the line it points at. You send it from Chat.')}
        multiline
        autoFocus
        value={comment}
        onChangeText={setComment}
        testID="line-comment-field"
      />
    </Sheet>
  );
}
