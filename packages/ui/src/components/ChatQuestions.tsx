import { View } from 'react-native';
import { Icon } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  list: { gap: t.spacing.xs },
  item: { gap: t.spacing.xxs },
  answer: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs },
}));

export interface ChatQuestionsItem {
  header?: string | null;
  text: string;
  options: readonly { label: string; detail?: string | null }[];
  isMultiSelect?: boolean;
  answer?: string | null;
  /** An answer the program holds back for now. */
  queuedAnswer?: string | null;
}

interface ChatQuestionsProps {
  questions: readonly ChatQuestionsItem[];
  /** Off when the row's title already reads the question. */
  showsText?: boolean;
  labels: {
    /** 'Pick one or more.' */
    multiSelect: string;
    /** 'Queued. Codex sends it after its next tool call.' */
    queued: string;
  };
  testID?: string;
}

/** What an Agent asked: each question, then its answer or, while it waits, the options it offers. */
export function ChatQuestions({
  questions,
  showsText = true,
  labels,
  testID = 'chat-questions',
}: ChatQuestionsProps) {
  const styles = useStyles();
  return (
    <View style={styles.list} testID={testID}>
      {questions.map((question, index) => {
        const answer = question.answer ?? question.queuedAnswer;
        return (
          // Questions never reorder: the transcript fixes them.
          // biome-ignore lint/suspicious/noArrayIndexKey: two questions may read the same.
          <View key={index} style={styles.item}>
            {question.header ? (
              <Text variant="caption" tone="secondary">
                {question.header}
              </Text>
            ) : null}
            {showsText ? <Text variant="subheadline">{question.text}</Text> : null}
            {answer ? (
              <View style={styles.answer}>
                <Icon name={question.answer ? 'chevronRight' : 'clock'} size={13} />
                <Text variant="subheadline">{answer}</Text>
              </View>
            ) : (
              <>
                {question.isMultiSelect ? (
                  <Text variant="footnote" tone="secondary">
                    {labels.multiSelect}
                  </Text>
                ) : null}
                {question.options.map((option) => (
                  <Text key={option.label} variant="footnote" tone="secondary">
                    {`• ${option.label}${option.detail ? ` · ${option.detail}` : ''}`}
                  </Text>
                ))}
              </>
            )}
            {!question.answer && question.queuedAnswer ? (
              <Text variant="caption" tone="secondary">
                {labels.queued}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
