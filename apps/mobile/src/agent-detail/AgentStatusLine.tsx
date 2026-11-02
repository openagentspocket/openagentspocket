import type { ConsoleRow } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { makeStyles, statusColorKey, Text, useTheme } from '@openagentspocket/ui';
import { View } from 'react-native';
import { statusDot } from '@/console/agentStatus';

const useStyles = makeStyles((th) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.spacing.xs,
    paddingHorizontal: th.spacing.lg,
    paddingTop: th.spacing.xs,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
}));

const WORDS = { blocked: 'Blocked', working: 'Working', done: 'Done', idle: 'Idle' } as const;

/** Swift's status line over the composer: the status word in its color, then where the Agent runs. */
export function AgentStatusLine({ row }: { row: ConsoleRow }) {
  const styles = useStyles();
  const theme = useTheme();
  const status = statusDot(row.agent.agent_status);
  const color = theme.colors[statusColorKey[status]];
  const place = [row.hostName, row.workspaceLabel].filter(Boolean).join(' · ');
  return (
    <View style={styles.row} testID="agent-status-line">
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text variant="caption2" style={{ color }}>
        {t(WORDS[status])}
      </Text>
      <Text variant="caption2" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
        {place}
      </Text>
    </View>
  );
}
