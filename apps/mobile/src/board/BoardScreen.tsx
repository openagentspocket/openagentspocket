import { t } from '@openagentspocket/i18n';
import { EmptyState, Screen, SectionHeader, Text } from '@openagentspocket/ui';
import { useRef } from 'react';
import { useConsoleState, useConsoleStore } from '../console/hooks';
import { BoardCard } from './BoardCard';
import { type BoardEntry, buildBoard, dragTarget } from './boardModel';

/** The overview board: every Agent on every Host, the pinned ones first in the order the user set. */
export function BoardScreen() {
  const store = useConsoleStore();
  const { rows } = useConsoleState();
  const { pinned, others } = buildBoard(rows, (hostId, paneId) => store.isPinned(hostId, paneId));
  const rowHeight = useRef(0);
  const drop = (index: number, translationY: number) => {
    const target = pinned[dragTarget(index, translationY, rowHeight.current, pinned.length)];
    const from = pinned[index];
    if (!target || !from || target.key === from.key) return;
    store.movePinTo(from.row.hostId, from.row.agent.pane_id, {
      hostId: target.row.hostId,
      paneId: target.row.agent.pane_id,
    });
  };
  const card = ({ key, row }: BoardEntry, entry: BoardEntry, index: number) => (
    <BoardCard
      key={key}
      entry={entry}
      onTogglePin={() => store.togglePin(row.hostId, row.agent.pane_id)}
      onMeasure={(height) => {
        rowHeight.current = height;
      }}
      onDrop={(dy) => drop(index, dy)}
      onMove={(direction) => store.movePin(row.hostId, row.agent.pane_id, direction)}
    />
  );
  return (
    <Screen testID="board-screen">
      <Text variant="title">{t('Agents')}</Text>
      {rows.length === 0 ? <EmptyState title={t('No Agents')} layout="compact" /> : null}
      {pinned.length > 0 ? (
        <>
          <SectionHeader title={t('Pinned')} count={pinned.length} />
          {pinned.map((entry, index) => card(entry, entry, index))}
        </>
      ) : null}
      {pinned.length > 0 && others.length > 0 ? (
        <SectionHeader title={t('Agents')} count={others.length} />
      ) : null}
      {others.map((entry, index) => card(entry, entry, index))}
    </Screen>
  );
}
