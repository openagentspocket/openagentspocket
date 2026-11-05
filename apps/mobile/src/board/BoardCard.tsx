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
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { statusDot } from '../console/agentStatus';
import { useEntryMenus } from '../navigation/entryMenus';
import { hrefs } from '../navigation/hrefs';
import type { BoardEntry } from './boardModel';
import { DragHandle } from './DragHandle';

const useStyles = makeStyles((th) => ({
  actions: { flexDirection: 'row', alignItems: 'center' },
  step: {
    minWidth: th.metrics.minTapSize,
    minHeight: th.metrics.minTapSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.3 },
  lifted: { zIndex: 1, opacity: 0.9 },
}));

interface BoardCardProps {
  entry: BoardEntry;
  onTogglePin: () => void;
  onMove: (direction: 'up' | 'down') => void;
  /** Set on a pinned card: the translation is in points from where the drag began. */
  onDrop?: (translationY: number) => void;
  onMeasure?: (height: number) => void;
}

/** One Agent on the board: status, name, Host and workspace, and the controls for its priority. */
export function BoardCard({ entry, onTogglePin, onMove, onDrop, onMeasure }: BoardCardProps) {
  const styles = useStyles();
  const router = useRouter();
  const entries = useEntryMenus();
  const [dragY] = useState(() => new Animated.Value(0));
  const [dragging, setDragging] = useState(false);
  const { row, rank, canMoveUp, canMoveDown } = entry;
  const pinned = rank !== undefined;
  const pane = row.agent.pane_id;
  const where = [row.hostName, row.workspaceLabel].filter(Boolean).join(' · ');
  const summary = row.lastOutputSnippet ?? inboxTitle(row);
  const menu: ActionMenuItem[] = [
    ...entries.agent(row),
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
    <Animated.View
      style={[dragging && styles.lifted, { transform: [{ translateY: dragY }] }]}
      onLayout={(event) => onMeasure?.(event.nativeEvent.layout.height)}
    >
      <Card padded={false} testID={`board-card-${pane}`}>
        <ListRow
          title={agentDisplayName(row.agent)}
          subtitle={[where, summary].filter(Boolean).join('\n')}
          leading={<StatusDot status={statusDot(row.agent.agent_status)} />}
          menu={menu}
          onPress={() => router.push(hrefs.agent(row.hostId, pane))}
          trailing={
            pinned ? (
              <View style={styles.actions}>
                <Badge label={String(rank)} kind="control" testID={`board-rank-${pane}`} />
                <DragHandle
                  testID={`board-drag-${pane}`}
                  onMove={(dy) => {
                    setDragging(true);
                    dragY.setValue(dy);
                  }}
                  onEnd={(dy) => {
                    setDragging(false);
                    dragY.setValue(0);
                    onDrop?.(dy);
                  }}
                />
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
    </Animated.View>
  );
}
