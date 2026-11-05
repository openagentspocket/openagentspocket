import type { ConsoleRow } from '@openagentspocket/core';
import { type Status, StatusLine } from '@openagentspocket/ui';
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
 * What sits over the Composer, in Swift's order: the Background Work strip (Chat; one line while the
 * Composer is open or a Blocked card stands in), the status line, then the Blocked card (Chat).
 */
export function DetailDock({ row, surface, status, latencyMs, onOpenChanges }: Props) {
  const { composing } = useDetailUi();
  const chat = surface === 'chat';
  return (
    <>
      {chat ? (
        <AgentBackgroundWork
          hostId={row.hostId}
          paneId={row.agent.pane_id}
          condensed={composing || row.agent.agent_status === 'blocked'}
        />
      ) : null}
      <StatusLine
        status={status}
        latencyMs={latencyMs}
        onOpenChanges={onOpenChanges}
        labels={agentBarLabels()}
      />
      {chat ? <BlockedCardSlot row={row} /> : null}
    </>
  );
}
