import { branchTitle, type CheckoutChanges, checkoutName } from '@openagentspocket/core';
import {
  type AgentBarLabels,
  Banner,
  ChangeRow,
  type ChangeSummary,
  defaultAgentBarLabels,
  makeStyles,
} from '@openagentspocket/ui';
import { View } from 'react-native';
import { ageText, readTimeText } from './format';
import { say } from './say';

const useStyles = makeStyles((t) => ({
  stack: { gap: t.spacing.xs },
}));

const labels = (): AgentBarLabels => ({
  ...defaultAgentBarLabels,
  worktree: say('Worktree'),
  possiblyIncomplete: (readAt) => say('Possibly incomplete · %@', readAt),
});

/** What the summary card draws: repo, Worktree capsule, totals, branch with counters, last commit. */
export function summaryOf(
  changes: CheckoutChanges,
  now: number,
  possiblyIncompleteSince: number | null,
): ChangeSummary {
  const { checkout, head, totals } = changes;
  const latest = head.latestCommit;
  const tracking = head.upstream?.state.kind === 'tracking' ? head.upstream.state : null;
  return {
    repo: checkoutName(checkout),
    worktree: checkout.isLinkedWorktree,
    added: totals.linesAreAvailable ? Number(totals.added) : 0,
    removed: totals.linesAreAvailable ? Number(totals.removed) : 0,
    branch: branchTitle(head, say),
    counts: tracking
      ? { behind: Number(tracking.behind), ahead: Number(tracking.ahead) }
      : undefined,
    lastCommit: latest
      ? { subject: latest.subject, age: ageText(latest.committedAt, now) }
      : undefined,
    possiblyIncompleteAt:
      possiblyIncompleteSince === null ? undefined : readTimeText(possiblyIncompleteSince, now),
  };
}

interface ChangesHeaderProps {
  changes: CheckoutChanges;
  now: number;
  /** When the document was read, while it may predate edits the Agent is still making. */
  possiblyIncompleteSince: number | null;
}

/** The calm summary card on top of Changes. */
export function ChangesHeader({ changes, now, possiblyIncompleteSince }: ChangesHeaderProps) {
  const styles = useStyles();
  return (
    <View style={styles.stack}>
      <ChangeRow
        summary={summaryOf(changes, now, possiblyIncompleteSince)}
        labels={labels()}
        testID="changes-header"
      />
      {changes.isMetadataTruncated ? (
        <Banner tone="info" title={say('Some Changes details were truncated.')} />
      ) : null}
    </View>
  );
}
