import type { KeyValueStorage } from '@openagentspocket/core';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { hrefs } from '@/navigation/hrefs';
import { composerKey, useComposerRegistry } from './composerContext';

export interface HandoffAgent {
  readonly hostId: string;
  readonly paneId: string;
}

let handoffs = 0;

/**
 * Puts text into an Agent's Composer from another screen and takes the user there, on Chat. The
 * text joins the draft as its own paragraph; nothing is sent: delivery stays the user's tap on
 * Send, behind every gate the Composer already has (Blocked, the program's send policy).
 */
export function useComposerHandoff(
  storage: KeyValueStorage,
): (agent: HandoffAgent, text: string) => void {
  const registry = useComposerRegistry(storage);
  const router = useRouter();
  return useCallback(
    ({ hostId, paneId }: HandoffAgent, text: string) => {
      registry.appendToDraft(composerKey(hostId, paneId), text);
      handoffs += 1;
      // Back to the Agent's detail when it is under this screen, else in place of this screen.
      router.dismissTo(hrefs.agent(hostId, paneId, { surface: 'chat', request: String(handoffs) }));
    },
    [registry, router],
  );
}
