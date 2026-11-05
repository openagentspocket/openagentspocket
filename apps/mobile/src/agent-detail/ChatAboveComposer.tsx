import type { ConsoleRow } from '@openagentspocket/core';
import { BlockedCardSlot } from '../blocked/BlockedCardSlot';
import { AgentBackgroundWork } from './background/AgentBackgroundWork';
import { useDetailUi } from './detailUi';

/** What Chat adds over the Composer: the Background Work strip (one line while the Composer is open or a Blocked card stands in), then the Blocked card. */
export function ChatAboveComposer({ row }: { row: ConsoleRow }) {
  const { composing } = useDetailUi();
  return (
    <>
      <AgentBackgroundWork
        hostId={row.hostId}
        paneId={row.agent.pane_id}
        condensed={composing || row.agent.agent_status === 'blocked'}
      />
      <BlockedCardSlot row={row} />
    </>
  );
}
