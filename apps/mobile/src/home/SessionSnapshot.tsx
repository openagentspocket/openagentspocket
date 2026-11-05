import type { ConsoleRow } from '@openagentspocket/core';
import { PaneSnapshot } from '@openagentspocket/ui';
import { usePaneSnapshot } from '../console/usePaneSnapshot';

/** A Sessions tile's thumbnail: the Agent's pane, last lines, nothing until the first read lands. */
export function SessionSnapshot({ row }: { row: ConsoleRow }) {
  const lines = usePaneSnapshot(
    row.hostId,
    row.agent.pane_id,
    row.agent.agent_status === 'working',
  );
  return lines && lines.length > 0 ? <PaneSnapshot lines={lines} /> : null;
}
