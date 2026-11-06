import { Children, Fragment, type ReactNode } from 'react';
import { type GestureResponderEvent, View } from 'react-native';
import { Badge } from '../primitives/Badge';
import { Card } from '../primitives/Card';
import { Icon } from '../primitives/Icon';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { airy } from '../theme/metrics';
import { makeStyles, useTheme } from '../theme/theme';
import { type AgentBarLabels, defaultAgentBarLabels } from './agentBarLabels';

const useStyles = makeStyles((t) => ({
  line: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs, minWidth: 0 },
  grow: { flex: 1 },
  dir: { flexShrink: 1, minWidth: 0 },
  fileName: { flexShrink: 0, maxWidth: '100%' },
  fixed: { flexShrink: 0 },
  totals: { flexDirection: 'row', gap: t.spacing.xxs },
  indent: { paddingLeft: t.spacing.xxs },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xxs,
    minHeight: t.metrics.rowMinHeight,
    paddingHorizontal: airy.stack,
  },
  indented: { paddingLeft: airy.stack * 2 },
  name: { flexShrink: 1 },
  commitLine: { gap: 6 },
  title: { flexShrink: 1, minWidth: 0 },
  age: { flexShrink: 0 },
  kind: { width: 14, textAlign: 'center' },
  rule: {
    height: t.metrics.hairlineWidth,
    backgroundColor: t.colors.separator,
    marginLeft: t.spacing.xs,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: t.spacing.md,
    paddingTop: t.spacing.md,
    paddingBottom: t.spacing.xxs,
  },
}));

/** M modified, A added, D deleted, R renamed, ? untracked, U conflicted. */
export type ChangeKind = 'M' | 'A' | 'D' | 'R' | '?' | 'U';

export interface ChangeSummary {
  repo: string;
  worktree?: boolean;
  added: number;
  removed: number;
  branch?: string;
  counts?: { behind?: number; ahead?: number };
  lastCommit?: { subject: string; age: string };
  /** "00:18"; present when the read may be stale. */
  possiblyIncompleteAt?: string;
}

export interface ChangeFile {
  name: string;
  dir?: string;
  /** Line counts; absent (untracked, binary) draws none. */
  added?: number;
  removed?: number;
  kind: ChangeKind;
  /** An untracked directory: a chevron that says whether its listing is open. */
  expanded?: boolean;
  staged?: boolean;
}

export type ChangeRowProps = (
  | { summary: ChangeSummary; file?: undefined }
  | { file: ChangeFile; summary?: undefined }
) & {
  onPress?: () => void;
  onLongPress?: (event: GestureResponderEvent) => void;
  /** A file inside an expanded directory sits one step in. */
  indent?: boolean;
  labels?: AgentBarLabels;
  testID?: string;
};

function Totals({ added, removed }: { added: number; removed: number }) {
  const styles = useStyles();
  return (
    <View style={styles.totals}>
      <Text variant="footnote" monospaced semibold tone="success" tabularNums>{`+${added}`}</Text>
      <Text variant="footnote" monospaced semibold tone="danger" tabularNums>{`−${removed}`}</Text>
    </View>
  );
}

/** One change entry: the repo summary card, or a file row (put file rows inside a ChangeSection). */
export function ChangeRow({
  summary,
  file,
  onPress,
  onLongPress,
  indent = false,
  labels = defaultAgentBarLabels,
  testID = 'change-row',
}: ChangeRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  if (summary) {
    const counts = [
      summary.counts?.behind ? `↓${summary.counts.behind}` : null,
      summary.counts?.ahead ? `↑${summary.counts.ahead}` : null,
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <Card
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityLabel={`${summary.repo}, +${summary.added} −${summary.removed}`}
        testID={testID}
      >
        <View style={styles.line}>
          <Text variant="headline" numberOfLines={1} style={styles.name}>
            {summary.repo}
          </Text>
          {summary.worktree ? <Badge kind="control" label={labels.worktree} /> : null}
          <View style={styles.grow} />
          <Totals added={summary.added} removed={summary.removed} />
        </View>
        {summary.branch ? (
          <View style={styles.line}>
            <Icon name="branch" size={14} tint={theme.colors.info} />
            <Text
              variant="subheadline"
              monospaced
              semibold
              numberOfLines={1}
              style={[styles.name, { color: theme.colors.info }]}
            >
              {summary.branch}
            </Text>
            {counts ? (
              <Text variant="caption" monospaced tone="secondary" tabularNums>
                {counts}
              </Text>
            ) : null}
          </View>
        ) : null}
        {summary.lastCommit ? (
          <View style={[styles.line, styles.commitLine]}>
            <Icon name="commit" size={14} />
            <Text variant="subheadline" numberOfLines={1} style={styles.title}>
              {summary.lastCommit.subject}
            </Text>
            <Text variant="caption" tone="secondary" numberOfLines={1} style={styles.age}>
              {`· ${summary.lastCommit.age}`}
            </Text>
          </View>
        ) : null}
        {summary.possiblyIncompleteAt ? (
          <Text variant="caption" tone="secondary">
            {labels.possiblyIncomplete(summary.possiblyIncompleteAt)}
          </Text>
        ) : null}
      </Card>
    );
  }
  const kindColor = {
    M: theme.colors.warning,
    A: theme.colors.success,
    D: theme.colors.danger,
    R: theme.colors.info,
    '?': theme.colors.textTertiary,
    U: theme.colors.danger,
  }[file.kind];
  return (
    <Tappable
      style={[styles.file, indent && styles.indented]}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={
        file.added === undefined
          ? `${file.name}, ${file.dir ?? ''}, ${file.kind}`
          : `${file.name}, ${file.dir ?? ''}, +${file.added} −${file.removed ?? 0}, ${file.kind}`
      }
      testID={testID}
    >
      <View style={[styles.nameLine, styles.grow]}>
        <Text variant="body" numberOfLines={1} style={styles.fileName}>
          {file.name}
        </Text>
        {file.dir ? (
          <Text variant="caption" tone="secondary" numberOfLines={1} style={styles.dir}>
            {file.dir}
          </Text>
        ) : null}
      </View>
      {file.added !== undefined ? <Totals added={file.added} removed={file.removed ?? 0} /> : null}
      {file.expanded !== undefined ? (
        <Icon
          name={file.expanded ? 'chevronDown' : 'chevronRight'}
          size={11}
          color="textTertiary"
        />
      ) : null}
      <Text variant="subheadline" semibold monospaced style={[styles.kind, { color: kindColor }]}>
        {file.kind}
      </Text>
    </Tappable>
  );
}

/** "CHANGES 2": the uppercase caption with the count at the right, over one card of file rows with hairlines. */
export function ChangeSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  const styles = useStyles();
  const rows = Children.toArray(children);
  return (
    <View>
      <View style={styles.head}>
        <Text variant="caption" tone="secondary" semibold>
          {title.toUpperCase()}
        </Text>
        <Text variant="caption" tone="secondary" tabularNums>
          {String(count)}
        </Text>
      </View>
      <Card padded={false} testID="change-section">
        {rows.map((row, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional children
          <Fragment key={index}>
            {index > 0 ? <View style={styles.rule} /> : null}
            {row}
          </Fragment>
        ))}
      </Card>
    </View>
  );
}
