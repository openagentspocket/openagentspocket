import { agentKind, type ConsoleRow, inboxTitle, rowKey } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { SessionsStrip, type StripSession } from '@openagentspocket/ui';
import { useMemo } from 'react';
import { statusDot } from '../console/agentStatus';

interface HomeSessionsProps {
  rows: readonly ConsoleRow[];
  onOpen: (row: ConsoleRow) => void;
  onSeeAll?: () => void;
}

/** The Sessions strip: every Agent as a terminal tile that bleeds to both screen edges. */
export function HomeSessions({ rows, onOpen, onSeeAll }: HomeSessionsProps) {
  const sessions = useMemo<StripSession[]>(
    () =>
      rows.map((row) => ({
        id: rowKey(row),
        kind: 'agent',
        name: agentKind(row.agent),
        title: inboxTitle(row),
        host: row.hostName,
        status: statusDot(row.agent.agent_status),
      })),
    [rows],
  );
  if (sessions.length === 0) return null;
  return (
    <SessionsStrip
      sessions={sessions}
      title={t('Sessions')}
      seeAllLabel={t('See all')}
      onOpen={(id) => {
        const row = rows.find((candidate) => rowKey(candidate) === id);
        if (row) onOpen(row);
      }}
      onSeeAll={() => onSeeAll?.()}
    />
  );
}
