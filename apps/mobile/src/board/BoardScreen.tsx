import { t } from '@openagentspocket/i18n';
import { EmptyState, Screen, SectionHeader, Text } from '@openagentspocket/ui';
import { useConsoleState, useConsoleStore } from '../console/hooks';
import { BoardCard } from './BoardCard';
import { type BoardEntry, buildBoard } from './boardModel';

/** The overview board: every Agent on every Host, the pinned ones first in the order the user set. */
export function BoardScreen() {
  const store = useConsoleStore();
  const { rows } = useConsoleState();
  const { pinned, others } = buildBoard(rows, (hostId, paneId) => store.isPinned(hostId, paneId));
  const card = ({ key, row }: BoardEntry, entry: BoardEntry) => (
    <BoardCard
      key={key}
      entry={entry}
      onTogglePin={() => store.togglePin(row.hostId, row.agent.pane_id)}
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
          {pinned.map((entry) => card(entry, entry))}
        </>
      ) : null}
      {pinned.length > 0 && others.length > 0 ? (
        <SectionHeader title={t('Agents')} count={others.length} />
      ) : null}
      {others.map((entry) => card(entry, entry))}
    </Screen>
  );
}
