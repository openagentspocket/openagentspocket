import type { ConsoleAgent } from '@openagentspocket/core';
import { Card, makeStyles, StatusDot, Text } from '@openagentspocket/ui';
import { View } from 'react-native';

const useStyles = makeStyles((t) => ({
  header: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
}));

export function AgentCard({ agent }: { agent: ConsoleAgent }) {
  const styles = useStyles();
  return (
    <Card testID={`agent-${agent.paneId}`}>
      <View style={styles.header}>
        <StatusDot status={agent.status === 'unknown' ? 'idle' : agent.status} />
        <Text variant="headline">{agent.name}</Text>
        {agent.workspaceLabel ? (
          <Text variant="caption" tone="secondary">
            {agent.workspaceLabel}
          </Text>
        ) : null}
      </View>
      {agent.summary ? (
        <Text variant="body" tone="secondary">
          {agent.summary}
        </Text>
      ) : null}
    </Card>
  );
}
