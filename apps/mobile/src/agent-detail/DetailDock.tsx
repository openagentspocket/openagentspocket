import { type ConsoleRow, rowDirectory } from '@openagentspocket/core';
import { type Status, StatusLine } from '@openagentspocket/ui';
import { statusLineGit } from '@/changes/statusLineGit';
import { useGitStatus } from '@/changes/useGitStatus';
import { BlockedCardSlot } from '../blocked/BlockedCardSlot';
import { agentBarLabels } from './agentBarLabels';
import { AgentBackgroundWork } from './background/AgentBackgroundWork';
import { useDetailUi } from './detailUi';
import type { Surface } from './surface';

interface Props {
  row: ConsoleRow;
  surface: Surface;
  status: Status;
  latencyMs?: number;
  onOpenChanges?: () => void;
}

/**
 * What sits over the Composer: the Background Work strip (Chat; one line while the
 * Composer is open or a Blocked card stands in), the Blocked card (Chat), then the status line.
 */
export function DetailDock({ row, surface, status, latencyMs, onOpenChanges }: Props) {
  const { composing } = useDetailUi();
  const chat = surface === 'chat';
  const git = useGitStatus(row.hostId, rowDirectory(row), row.agent.pane_id);
  return (
    <>
      {chat ? (
        <AgentBackgroundWork
          hostId={row.hostId}
          paneId={row.agent.pane_id}
          condensed={composing || row.agent.agent_status === 'blocked'}
        />
      ) : null}
      {chat ? <BlockedCardSlot row={row} /> : null}
      <StatusLine
        status={status}
        {...statusLineGit(git)}
        latencyMs={latencyMs}
        onOpenChanges={onOpenChanges}
        labels={agentBarLabels()}
      />
    </>
  );
}
