import { agentDisplayName, type ConsoleRow, rowKey } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { type DrawerWorkspace, SessionDrawer } from '@openagentspocket/ui';
import { useMemo } from 'react';
import { statusDot } from '@/console/agentStatus';
import { agentBarLabels } from './agentBarLabels';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** The Agents of the Host being viewed. */
  rows: readonly ConsoleRow[];
  current: ConsoleRow;
  onSelect: (row: ConsoleRow) => void;
}

/** The left drawer: this Host's Workspaces with their Agents; tapping one switches in place. */
export function AgentSessionDrawer({ visible, onClose, rows, current, onSelect }: Props) {
  const hostRows = useMemo(
    () => rows.filter((row) => row.hostId === current.hostId),
    [rows, current.hostId],
  );
  const workspaces = useMemo(() => {
    const groups = new Map<
      string,
      DrawerWorkspace & { items: DrawerWorkspace['items'][number][] }
    >();
    for (const row of hostRows) {
      const id = row.agent.workspace_id;
      const group = groups.get(id) ?? {
        id,
        title: row.workspaceLabel ?? id,
        items: [],
      };
      group.items.push({
        id: rowKey(row),
        kind: 'agent',
        title: agentDisplayName(row.agent),
        program: row.agent.agent ?? 'unknown',
        status: statusDot(row.agent.agent_status),
      });
      groups.set(id, group);
    }
    return [...groups.values()];
  }, [hostRows]);
  return (
    <SessionDrawer
      visible={visible}
      onClose={onClose}
      host={{ name: current.hostName, summary: t('%lld Agents', hostRows.length) }}
      workspaces={workspaces}
      selectedId={rowKey(current)}
      onSelect={(id) => {
        const row = hostRows.find((candidate) => rowKey(candidate) === id);
        onClose();
        if (row && rowKey(row) !== rowKey(current)) onSelect(row);
      }}
      labels={agentBarLabels()}
    />
  );
}
