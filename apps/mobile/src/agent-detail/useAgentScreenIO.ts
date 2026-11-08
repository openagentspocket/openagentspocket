import { herdrScreenIO, isBlockedPaneApi } from '@openagentspocket/transport';
import { useMemo } from 'react';
import { useConsoleStore } from '@/console/hooks';

/** Reads an Agent's screen and presses keys in it, over the Host's live transport. */
export function useAgentScreenIO(hostId: string, paneId: string) {
  const consoleStore = useConsoleStore();
  return useMemo(
    () =>
      herdrScreenIO(paneId, (operation) =>
        consoleStore.withTransport(hostId, async (transport) => {
          if (!isBlockedPaneApi(transport)) throw new Error('This Host cannot read panes.');
          return operation(transport);
        }),
      ),
    [consoleStore, hostId, paneId],
  );
}
