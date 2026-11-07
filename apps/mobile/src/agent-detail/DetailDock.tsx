import { type ConsoleRow, rowDirectory } from '@openagentspocket/core';
import { type Status, StatusLine } from '@openagentspocket/ui';
import { statusLineGit } from '@/changes/statusLineGit';
import { useGitStatus } from '@/changes/useGitStatus';
import { useShownStatus } from '../blocked/BlockedCardProvider';
import { BlockedCardSlot } from '../blocked/BlockedCardSlot';
import { agentBarLabels } from './agentBarLabels';
import { AgentBackgroundWork } from './background/AgentBackgroundWork';
import { DockSlotView, useDetailUi } from './detailUi';
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
  const shown = useShownStatus(status);
  const git = useGitStatus(row.hostId, rowDirectory(row), row.agent.pane_id);
  return (
    <>
      {chat ? (
        <AgentBackgroundWork
          hostId={row.hostId}
          paneId={row.agent.pane_id}
          condensed={composing || shown === 'blocked'}
        />
      ) : null}
      {chat ? <BlockedCardSlot /> : null}
      <StatusLine
        status={shown}
        {...statusLineGit(git)}
        latencyMs={latencyMs}
        onOpenChanges={onOpenChanges}
        labels={agentBarLabels()}
      />
      <DockSlotView />
    </>
  );
}
