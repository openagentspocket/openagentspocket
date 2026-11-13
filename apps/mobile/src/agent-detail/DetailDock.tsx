import type { ConsoleRow } from '@openagentspocket/core';
import { statusDot } from '@/console/agentStatus';
import { useShownStatus } from '../blocked/BlockedCardProvider';
import { BlockedCardSlot } from '../blocked/BlockedCardSlot';
import { AgentBackgroundWork } from './background/AgentBackgroundWork';
import { DockSlotView } from './detailUi';
import type { Surface } from './surface';

interface Props {
  row: ConsoleRow;
  surface: Surface;
}

/**
 * What sits over the Composer: the status line (Chat: the running turn and its Background Work),
 * the Blocked card (Chat), then what the surface hands the dock.
 */
export function DetailDock({ row, surface }: Props) {
  const chat = surface === 'chat';
  const shown = useShownStatus(statusDot(row.agent.agent_status));
  return (
    <>
      {chat ? (
        <AgentBackgroundWork
          hostId={row.hostId}
          paneId={row.agent.pane_id}
          isBlocked={shown === 'blocked'}
        />
      ) : null}
      {chat ? <BlockedCardSlot /> : null}
      <DockSlotView />
    </>
  );
}
