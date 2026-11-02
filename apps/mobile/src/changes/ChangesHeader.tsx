import {
  branchTitle,
  type ChangesTotals,
  type CheckoutChanges,
  checkoutName,
  filesSummary,
  lineCountsSummary,
  spokenUntracked,
  upstreamSummary,
} from '@openagentspocket/core';
import { Badge, Banner, Card, makeStyles, Text } from '@openagentspocket/ui';
import { View } from 'react-native';
import { ageText, freshnessText } from './format';
import { say } from './say';

const useStyles = makeStyles((t) => ({
  stack: { gap: t.spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs, flexWrap: 'wrap' },
}));

function totalsLine(totals: ChangesTotals, truncated: boolean): string {
  const parts = [filesSummary(totals, say, truncated && totals.untrackedItems === 0)];
  if (totals.linesAreAvailable && (totals.added > 0 || totals.removed > 0)) {
    parts.push(
      lineCountsSummary({ kind: 'lines', added: totals.added, removed: totals.removed }, say),
    );
  }
  if (totals.untrackedItems > 0 || truncated) parts.push(spokenUntracked(totals, truncated, say));
  return parts.join(' · ');
}

interface ChangesHeaderProps {
  changes: CheckoutChanges;
  now: number;
  /** When the document was read, while it may predate edits the Agent is still making. */
  possiblyIncompleteSince: number | null;
}

/** The Checkout (name, Worktree capsule, branch, upstream, latest commit) and its totals. */
export function ChangesHeader({ changes, now, possiblyIncompleteSince }: ChangesHeaderProps) {
  const styles = useStyles();
  const { checkout, head } = changes;
  const latest = head.latestCommit;
  return (
    <View style={styles.stack}>
      <Card testID="changes-header">
        <View style={styles.row}>
          <Text variant="headline">{checkoutName(checkout)}</Text>
          {checkout.isLinkedWorktree ? <Badge label={say('Worktree')} kind="outline" /> : null}
        </View>
        <Text variant="mono" tone="tertiary" numberOfLines={1}>
          {checkout.displayPath}
        </Text>
        <Text variant="callout">{branchTitle(head, say)}</Text>
        {head.upstream ? (
          <Text variant="footnote" tone="secondary">
            {upstreamSummary(head.upstream, say)}
          </Text>
        ) : null}
        {latest ? (
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {`${latest.subject} · ${ageText(latest.committedAt, now)}`}
          </Text>
        ) : null}
        <Text variant="footnote" tone="secondary" testID="changes-totals">
          {totalsLine(changes.totals, changes.isStatusTruncated)}
        </Text>
      </Card>
      {possiblyIncompleteSince !== null ? (
        <Banner
          tone="warning"
          title={freshnessText(possiblyIncompleteSince, now)}
          testID="changes-freshness"
        />
      ) : null}
      {changes.isMetadataTruncated ? (
        <Banner tone="info" title={say('Some Changes details were truncated.')} />
      ) : null}
    </View>
  );
}
