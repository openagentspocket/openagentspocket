import { agentDisplayName, type ConsoleRow, rowKey } from '@openagentspocket/core';
import { type ActionMenuItem, STATUS_GLYPH } from '@openagentspocket/ui';
import { statusDot } from '@/console/agentStatus';
import { agentBarLabels } from './agentBarLabels';

/** The title's quick menu: every Agent of the current one's Host with its status; nothing if alone. */
export function hostAgentItems(
  rows: readonly ConsoleRow[],
  current: ConsoleRow,
  onSelect: (row: ConsoleRow) => void,
): ActionMenuItem[] {
  const labels = agentBarLabels();
  const agents = rows.filter((row) => row.hostId === current.hostId);
  if (agents.length < 2) return [];
  return agents.map((row) => {
    const status = statusDot(row.agent.agent_status);
    const here = rowKey(row) === rowKey(current);
    return {
      key: row.agent.pane_id,
      title: agentDisplayName(row.agent),
      subtitle: labels[status],
      icon: STATUS_GLYPH[status],
      checked: here,
      onPress: () => {
        if (!here) onSelect(row);
      },
    };
  });
}

/** Whether another Agent of the Host waits on the user: what the Sessions button's dot says. */
export function otherAgentBlocked(rows: readonly ConsoleRow[], current: ConsoleRow): boolean {
  return rows.some(
    (row) =>
      row.hostId === current.hostId &&
      rowKey(row) !== rowKey(current) &&
      row.agent.agent_status === 'blocked',
  );
}
