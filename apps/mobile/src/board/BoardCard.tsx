import { agentDisplayName, inboxTitle } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  type ActionMenuItem,
  Badge,
  Card,
  Icon,
  ListRow,
  makeStyles,
  type Status,
  StatusDot,
} from '@openagentspocket/ui';
import { Pressable, View } from 'react-native';
import type { BoardEntry } from './boardModel';

function statusDot(status: string): Status {
  return status === 'blocked' || status === 'done' || status === 'working' ? status : 'idle';
}

const useStyles = makeStyles((th) => ({
  actions: { flexDirection: 'row', alignItems: 'center' },
  step: {
    minWidth: th.metrics.minTapSize,
    minHeight: th.metrics.minTapSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.3 },
}));

interface BoardCardProps {
  entry: BoardEntry;
  onTogglePin: () => void;
  onMove: (direction: 'up' | 'down') => void;
}

/** One Agent on the board: status, name, Host and workspace, and the controls for its priority. */
export function BoardCard({ entry, onTogglePin, onMove }: BoardCardProps) {
  const styles = useStyles();
  const { row, rank, canMoveUp, canMoveDown } = entry;
  const pinned = rank !== undefined;
  const pane = row.agent.pane_id;
  const where = [row.hostName, row.workspaceLabel].filter(Boolean).join(' · ');
  const summary = row.lastOutputSnippet ?? inboxTitle(row);
  const menu: ActionMenuItem[] = [
    { key: 'pin', title: pinned ? t('Unpin') : t('Pin'), icon: 'pin', onPress: onTogglePin },
  ];
  if (canMoveUp) {
    menu.push({ key: 'up', title: t('Move up'), icon: 'arrowUp', onPress: () => onMove('up') });
  }
  if (canMoveDown) {
    menu.push({
      key: 'down',
      title: t('Move down'),
      icon: 'arrowDown',
      onPress: () => onMove('down'),
    });
  }
  const step = (direction: 'up' | 'down', enabled: boolean) => (
    <Pressable
      style={[styles.step, !enabled && styles.disabled]}
      disabled={!enabled}
      onPress={() => onMove(direction)}
      accessibilityRole="button"
      accessibilityLabel={direction === 'up' ? t('Move up') : t('Move down')}
      testID={`board-${direction}-${pane}`}
    >
      <Icon name={direction === 'up' ? 'arrowUp' : 'arrowDown'} />
    </Pressable>
  );
  return (
    <Card padded={false} testID={`board-card-${pane}`}>
      <ListRow
        title={agentDisplayName(row.agent)}
        subtitle={[where, summary].filter(Boolean).join('\n')}
        leading={<StatusDot status={statusDot(row.agent.agent_status)} />}
        menu={menu}
        trailing={
          pinned ? (
            <View style={styles.actions}>
              <Badge label={String(rank)} kind="control" testID={`board-rank-${pane}`} />
              {step('up', canMoveUp)}
              {step('down', canMoveDown)}
            </View>
          ) : (
            <Pressable
              style={styles.step}
              onPress={onTogglePin}
              accessibilityRole="button"
              accessibilityLabel={t('Pin')}
              testID={`board-pin-${pane}`}
            >
              <Icon name="pin" />
            </Pressable>
          )
        }
        testID={`board-row-${pane}`}
      />
    </Card>
  );
}
