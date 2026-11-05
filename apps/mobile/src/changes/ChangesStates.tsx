import {
  type ChangesPhase,
  type ChangesReadReason,
  readFailureMessage,
  readFailureTitle,
} from '@openagentspocket/core';
import {
  Banner,
  EmptyState,
  ErrorState,
  makeStyles,
  SkeletonRows,
  Text,
} from '@openagentspocket/ui';
import { View } from 'react-native';
import { say } from './say';

function failureCopy(phase: ChangesPhase): { title: string; message: string } | null {
  switch (phase.kind) {
    case 'readFailed': {
      const reason: ChangesReadReason = phase.reason;
      return { title: readFailureTitle(reason, say), message: readFailureMessage(reason, say) };
    }
    case 'timedOut':
      return {
        title: say('Reading Changes Timed Out'),
        message: say('The Host took too long to read Changes. Pull to try again.'),
      };
    case 'failed':
      return { title: say("Couldn't Read Changes"), message: phase.message };
    default:
      return null;
  }
}

/** The whole-screen state when there is no document: reading, or a failure with Try Again. */
export function ChangesBlockedState({
  phase,
  onRetry,
}: {
  phase: ChangesPhase;
  onRetry: () => void;
}) {
  const failure = failureCopy(phase);
  if (!failure) return <SkeletonRows accessibilityLabel={say('Reading Changes…')} />;
  return (
    <ErrorState
      summary={failure.title}
      recovery={failure.message}
      onRetry={onRetry}
      retryLabel={say('Try Again')}
      testID="changes-failure"
    />
  );
}

/** Nothing to commit. */
export function CleanState() {
  return <EmptyState icon="success" title={say('No uncommitted changes')} testID="changes-clean" />;
}

/** A refresh timed out but the last document stays on screen. */
export function TimedOutBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <Banner
      tone="warning"
      title={say('Reading Changes Timed Out')}
      message={say('The Host took too long to read Changes. Pull to try again.')}
      actionLabel={say('Try Again')}
      onAction={onRetry}
      testID="changes-timed-out"
    />
  );
}

/** A line under a directory row: loading, failed or limited listing. */
const useStyles = makeStyles((t) => ({ note: { padding: t.spacing.sm } }));

export function ChangesNote({ text }: { text: string }) {
  const styles = useStyles();
  return (
    <View style={styles.note} testID="changes-note">
      <Text variant="caption" tone="secondary">
        {text}
      </Text>
    </View>
  );
}
