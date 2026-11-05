import type { ConsoleRow } from '@openagentspocket/core';
import { BlockedCardSlot } from '../blocked/BlockedCardSlot';
import { AgentBackgroundWork } from './background/AgentBackgroundWork';

/** What Chat adds over the Composer: the Background Work strip, then the Blocked card (which condenses the strip). */
export function ChatAboveComposer({ row }: { row: ConsoleRow }) {
  return (
    <>
      <AgentBackgroundWork
        hostId={row.hostId}
        paneId={row.agent.pane_id}
        condensed={row.agent.agent_status === 'blocked'}
      />
      <BlockedCardSlot row={row} />
    </>
  );
}
