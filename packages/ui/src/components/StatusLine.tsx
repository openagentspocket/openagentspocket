import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '../primitives/Icon';
import { StatusDot } from '../primitives/StatusDot';
import { Text } from '../primitives/Text';
import { airy } from '../theme/metrics';
import type { Status } from '../theme/status';
import { makeStyles, useTheme } from '../theme/theme';
import { type AgentBarLabels, defaultAgentBarLabels } from './agentBarLabels';

/** Under this width the latency is dropped so the branch name keeps fitting. */
const COMPACT_WIDTH = 340;

const useStyles = makeStyles((t) => ({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xxs,
    marginHorizontal: t.spacing.sm,
    minHeight: 28,
  },
  group: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs },
  branch: { flexShrink: 1, minWidth: 0 },
  fixed: { flexShrink: 0 },
  spacer: { flex: 1 },
  pill: { borderRadius: 999, paddingHorizontal: airy.stack, paddingVertical: 2 },
}));

export interface StatusLineProps {
  status?: Status;
  branch?: string;
  counts?: { behind?: number; ahead?: number; changed?: number };
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
  const hasCounts = Boolean(counts && (counts.behind || counts.ahead || counts.changed));
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
        ? '< 1 ms'
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
    counts?.changed ? `!${counts.changed}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Pressable
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
          <StatusDot status={status} size={airy.statusLineDot} />
          <Text variant="caption" semibold style={{ color: theme.status(status) }}>
            {statusWord(status, labels)}
          </Text>
        </View>
      ) : null}
      {branch ? (
        <View style={[styles.group, styles.branch]}>
          <Icon name="branch" size={12} tint={theme.colors.info} />
          <Text
            variant="caption2"
            monospaced
            semibold
            numberOfLines={1}
            style={[styles.branch, { color: theme.colors.info }]}
          >
            {branch}
          </Text>
        </View>
      ) : null}
      {hasCounts ? (
        <Text
          variant="caption2"
          monospaced
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
          <Text variant="caption2" semibold tone="warning">
            {labels.contextLeft(contextLeft)}
          </Text>
        </View>
      ) : null}
      {diff ? (
        <View style={styles.group}>
          <Text variant="caption2" monospaced tone="success" tabularNums>
            {`+${diff.added}`}
          </Text>
          <Text variant="caption2" monospaced tone="danger" tabularNums>
            {`−${diff.removed}`}
          </Text>
        </View>
      ) : null}
      {latency ? (
        <Text
          variant="caption2"
          monospaced
          tone="secondary"
          tabularNums
          numberOfLines={1}
          style={styles.fixed}
        >
          {latency}
        </Text>
      ) : null}
    </Pressable>
  );
}
