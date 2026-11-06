import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '../primitives/Icon';
import { StatusDot } from '../primitives/StatusDot';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { airy } from '../theme/metrics';
import type { Status } from '../theme/status';
import { makeStyles, useTheme } from '../theme/theme';
import { type AgentBarLabels, defaultAgentBarLabels } from './agentBarLabels';

/** Under this width the latency is dropped so the branch name keeps fitting. */
const COMPACT_WIDTH = 300;

const useStyles = makeStyles((t) => ({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xxs - 1,
    marginHorizontal: t.spacing.xs + 2,
    minHeight: 32,
  },
  group: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs },
  branch: { flexShrink: 1, minWidth: 0 },
  /** The branch gives way first, down to its glyph (as Swift's low-context line does). */
  branchGroup: { minWidth: 16 },
  fixed: { flexShrink: 0 },
  hidden: { opacity: 0 },
  spacer: { flex: 1, minWidth: 0 },
  sep: { width: StyleSheet.hairlineWidth * 2, height: 16, backgroundColor: t.colors.separator },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pill: { borderRadius: 999, paddingHorizontal: airy.stack - 3, paddingVertical: 2, flexShrink: 0 },
}));

export interface StatusLineProps {
  status?: Status;
  branch?: string;
  counts?: {
    behind?: number;
    ahead?: number;
    /** Conflicted files (`~`), as Tide shows them before the staged count. */
    conflicts?: number;
    staged?: number;
    changed?: number;
    untracked?: number;
  };
  diff?: { added: number; removed: number };
  /** Percent of context left; shown as an amber pill under 20. */
  contextLeft?: number;
  latencyMs?: number;
  onOpenChanges?: () => void;
  labels?: AgentBarLabels;
  testID?: string;
}

const statusWord = (status: Status, labels: AgentBarLabels) =>
  ({ working: labels.working, idle: labels.idle, blocked: labels.blocked, done: labels.done })[
    status
  ];

/** The one-line caption above the composer: status, branch, counters, diff, context, latency. */
export function StatusLine({
  status,
  branch,
  counts,
  diff,
  contextLeft,
  latencyMs,
  onOpenChanges,
  labels = defaultAgentBarLabels,
  testID = 'status-line',
}: StatusLineProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [width, setWidth] = useState(Number.POSITIVE_INFINITY);
  const [branchWidth, setBranchWidth] = useState(Number.POSITIVE_INFINITY);
  const hasCounts = Boolean(
    counts &&
      (counts.behind ||
        counts.ahead ||
        counts.conflicts ||
        counts.staged ||
        counts.changed ||
        counts.untracked),
  );
  if (
    !status &&
    !branch &&
    !hasCounts &&
    !diff &&
    contextLeft === undefined &&
    latencyMs === undefined
  )
    return null;
  const lowContext = contextLeft !== undefined && contextLeft < 20;
  const latency =
    latencyMs === undefined || width < COMPACT_WIDTH
      ? null
      : latencyMs < 1
        ? '<1 ms'
        : `${Math.round(latencyMs)} ms`;
  const summary = [
    status ? statusWord(status, labels) : null,
    branch,
    diff ? `+${diff.added} -${diff.removed}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  const countText = [
    counts?.behind ? `↓${counts.behind}` : null,
    counts?.ahead ? `↑${counts.ahead}` : null,
    counts?.conflicts ? `~${counts.conflicts}` : null,
    counts?.staged ? `+${counts.staged}` : null,
    counts?.changed ? `!${counts.changed}` : null,
    counts?.untracked ? `?${counts.untracked}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Tappable
      style={styles.line}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onPress={onOpenChanges}
      disabled={!onOpenChanges}
      accessibilityRole={onOpenChanges ? 'button' : 'text'}
      accessibilityLabel={summary}
      accessibilityHint={onOpenChanges ? labels.openChanges : undefined}
      testID={testID}
    >
      {status ? (
        <View style={styles.group}>
          <StatusDot status={status} size={airy.statusLineDot + 2} />
          <Text variant="subheadline" semibold style={{ color: theme.status(status) }}>
            {statusWord(status, labels)}
          </Text>
        </View>
      ) : null}
      {status && branch ? <View style={styles.sep} /> : null}
      {branch ? (
        <View style={[styles.group, styles.branch, styles.branchGroup]}>
          <Icon name="branch" size={15} tint={theme.colors.info} />
          <Text
            variant="footnote"
            monospaced
            semibold
            numberOfLines={1}
            onLayout={(e) => setBranchWidth(e.nativeEvent.layout.width)}
            // A name squeezed to a sliver reads as noise: leave the glyph alone.
            style={[styles.branch, { color: theme.colors.info }, branchWidth < 14 && styles.hidden]}
          >
            {branch}
          </Text>
        </View>
      ) : null}
      {hasCounts ? (
        <Text
          variant="caption"
          monospaced
          semibold
          tone="secondary"
          tabularNums
          numberOfLines={1}
          style={styles.fixed}
        >
          {countText}
        </Text>
      ) : null}
      <View style={styles.spacer} />
      {lowContext ? (
        <View style={[styles.pill, { backgroundColor: theme.wash(theme.colors.warning) }]}>
          <View style={styles.pillRow}>
            <Icon name="warning" size={12} tint={theme.colors.warning} />
            <Text variant="caption" semibold tone="warning" numberOfLines={1}>
              {labels.contextLeft(contextLeft)}
            </Text>
          </View>
        </View>
      ) : null}
      {diff ? (
        <View style={styles.group}>
          <Text variant="caption" monospaced semibold tone="success" tabularNums>
            {`+${diff.added}`}
          </Text>
          <Text variant="caption" monospaced semibold tone="danger" tabularNums>
            {`−${diff.removed}`}
          </Text>
        </View>
      ) : null}
      {latency && (diff || lowContext) ? <View style={styles.sep} /> : null}
      {latency ? (
        <Text
          variant="caption"
          monospaced
          tone="secondary"
          tabularNums
          numberOfLines={1}
          style={styles.fixed}
        >
          {latency}
        </Text>
      ) : null}
    </Tappable>
  );
}
