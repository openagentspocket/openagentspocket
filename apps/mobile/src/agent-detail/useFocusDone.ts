import type { ConsoleTransport } from '@openagentspocket/core';
import { useEffect, useRef } from 'react';
import { useConsoleStore } from '../console/hooks';

/** The slice of the live Transport that focuses an Agent (`HerdrApi.focusAgent`). */
interface FocusTransport extends ConsoleTransport {
  focusAgent(params: { target: string }): Promise<void>;
}

function canFocus(transport: ConsoleTransport): transport is FocusTransport {
  return 'focusAgent' in transport && typeof transport.focusAgent === 'function';
}

/**
 * Opening a Done Agent focuses it on its Host, which marks it seen. Sent once per visit and
 * best effort: a Host that is not ready, or an Agent that is gone, is not worth an error.
 * Transports without a focus call (the demo) skip it.
 */
export function useFocusDone(hostId: string, paneId: string, isDone: boolean): void {
  const store = useConsoleStore();
  const sent = useRef<string>(undefined);
  useEffect(() => {
    const key = `${hostId}/${paneId}`;
    if (!isDone || sent.current === key) return;
    sent.current = key;
    store
      .focusAgent(hostId, paneId, async (transport) => {
        if (canFocus(transport)) await transport.focusAgent({ target: paneId });
      })
      .catch(() => {
        sent.current = undefined;
      });
  }, [store, hostId, paneId, isDone]);
}
