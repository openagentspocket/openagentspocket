import { herdrScreenIO, isBlockedPaneApi } from '@openagentspocket/transport';
import { useMemo } from 'react';
import { useConsoleStore } from '@/console/hooks';
import { usePaneAddressing } from './paneAddressing';

/** Reads an Agent's screen and presses keys in it, over the Host's live transport (by pane when herdr detects no Agent). */
export function useAgentScreenIO(hostId: string, paneId: string) {
  const consoleStore = useConsoleStore();
  const addressing = usePaneAddressing(hostId, paneId);
  return useMemo(
    () =>
      herdrScreenIO(
        paneId,
        (operation) =>
          consoleStore.withTransport(hostId, async (transport) => {
            if (!isBlockedPaneApi(transport)) throw new Error('This Host cannot read panes.');
            return operation(transport);
          }),
        addressing,
      ),
    [consoleStore, hostId, paneId, addressing],
  );
}
