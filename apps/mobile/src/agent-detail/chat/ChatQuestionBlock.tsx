import type { ChatQuestion } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, ChatQuestions, makeStyles, Text } from '@openagentspocket/ui';
import { View } from 'react-native';
import { useAgentWait } from '../../blocked/BlockedCardProvider';

const useStyles = makeStyles((th) => ({
  stack: { gap: th.spacing.xs, paddingBottom: th.spacing.xs },
  way: { alignItems: 'flex-start', gap: th.spacing.xxs },
}));

interface Props {
  questions: readonly ChatQuestion[];
  /** This row is what the Agent waits on, so it says where the answer goes when Chat cannot take it. */
  asking: boolean;
  showsText?: boolean;
}

/** What an Agent asked, and the way to the terminal for a question no card can answer. */
export function ChatQuestionBlock({ questions, asking, showsText = true }: Props) {
  const styles = useStyles();
  const { wait, showTerminal } = useAgentWait();
  const waiting = questions.some((question) => !question.answer && !question.queuedAnswer);
  return (
    <View style={styles.stack}>
      <ChatQuestions
        questions={questions}
        showsText={showsText}
        labels={{
          multiSelect: t('Pick one or more.'),
          queued: t('Queued. Codex sends it after its next tool call.'),
        }}
      />
      {asking && waiting && wait === 'terminal' ? (
        <View style={styles.way} testID="chat-question-unread">
          <Text variant="footnote" tone="warning">
            {t(
              "Agentico can't read this question on the Agent's screen. Answer it in the terminal.",
            )}
          </Text>
          <Button
            title={t('Show Terminal')}
            kind="secondary"
            size="small"
            onPress={showTerminal}
            testID="chat-question-terminal"
          />
        </View>
      ) : null}
    </View>
  );
}
