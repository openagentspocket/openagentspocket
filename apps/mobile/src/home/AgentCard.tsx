import { agentDisplayName, type ConsoleRow, inboxTitle } from '@openagentspocket/core';
import { Card, makeStyles, type Status, StatusDot, Text } from '@openagentspocket/ui';
import { View } from 'react-native';

function statusDot(status: string): Status {
  return status === 'blocked' || status === 'done' || status === 'working' ? status : 'idle';
}

const useStyles = makeStyles((t) => ({
  header: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
}));

export function AgentCard({ row }: { row: ConsoleRow }) {
  const styles = useStyles();
  const summary = row.lastOutputSnippet ?? inboxTitle(row);
  return (
    <Card testID={`agent-${row.agent.pane_id}`}>
      <View style={styles.header}>
        <StatusDot status={statusDot(row.agent.agent_status)} />
        <Text variant="headline">{agentDisplayName(row.agent)}</Text>
        {row.workspaceLabel ? (
          <Text variant="caption" tone="secondary">
            {row.workspaceLabel}
          </Text>
        ) : null}
      </View>
      {summary ? (
        <Text variant="body" tone="secondary">
          {summary}
        </Text>
      ) : null}
    </Card>
  );
}
