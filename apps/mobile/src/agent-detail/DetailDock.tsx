import type { ConsoleRow } from '@openagentspocket/core';
import { BlockedCardSlot } from '../blocked/BlockedCardSlot';
import { AgentBackgroundWork } from './background/AgentBackgroundWork';
import { DockSlotView, useDetailUi } from './detailUi';
import type { Surface } from './surface';

interface Props {
  row: ConsoleRow;
  surface: Surface;
}

/**
 * What sits over the Composer: the Background Work strip (Chat; one line while the
 * Composer is open or a Blocked card stands in), the Blocked card (Chat), then what the surface
 * hands the dock.
 */
export function DetailDock({ row, surface }: Props) {
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
      {chat ? <BlockedCardSlot row={row} /> : null}
      <DockSlotView />
    </>
  );
}
