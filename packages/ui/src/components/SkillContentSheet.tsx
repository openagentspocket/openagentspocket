import { View } from 'react-native';
import { Sheet } from '../overlay/Sheet';
import { Button } from '../primitives/Button';
import { Spinner } from '../primitives/Spinner';
import { Text } from '../primitives/Text';
import { makeStyles, useTheme } from '../theme/theme';

export type SkillContentState = 'loading' | 'loaded' | 'failed';

const useStyles = makeStyles((t) => ({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.sm,
    paddingVertical: t.spacing.xl,
  },
  message: { textAlign: 'center', paddingHorizontal: t.spacing.md },
  document: { paddingBottom: t.spacing.md },
}));

interface SkillContentSheetProps {
  visible: boolean;
  /** The skill's slash command: the sheet title. */
  name: string;
  state: SkillContentState;
  /** The skill's document, when loaded. */
  content?: string;
  /** Why loading failed. */
  message?: string;
  onClose: () => void;
  onRetry?: () => void;
  doneLabel?: string;
  retryLabel?: string;
  testID?: string;
}

/** The skill's full document, fetched on demand: a large sheet with Done, a spinner, the text in mono, or a failure with Retry. */
export function SkillContentSheet({
  visible,
  name,
  state,
  content,
  message,
  onClose,
  onRetry,
  doneLabel = 'Done',
  retryLabel = 'Retry',
  testID = 'skill-content-sheet',
}: SkillContentSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={name}
      detent="large"
      trailing={{ label: doneLabel, onPress: onClose }}
      testID={testID}
    >
      {state === 'loading' ? (
        <View style={styles.center}>
          <Spinner testID="skill-content-loading" />
        </View>
      ) : null}
      {state === 'loaded' ? (
        <Text
          variant="footnote"
          monospaced
          selectable
          style={styles.document}
          testID="skill-content-text"
        >
          {content ?? ''}
        </Text>
      ) : null}
      {state === 'failed' ? (
        <View style={styles.center} testID="skill-content-failed">
          <Text variant="subheadline" tone="secondary" style={styles.message}>
            {message ?? ''}
          </Text>
          {onRetry ? <Button kind="secondary" title={retryLabel} onPress={onRetry} /> : null}
        </View>
      ) : null}
    </Sheet>
  );
}
