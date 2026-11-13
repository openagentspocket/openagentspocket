import type { KeyValueStorage } from '@openagentspocket/core';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { hrefs } from '@/navigation/hrefs';
import { composerKey, useComposerRegistry } from './composerContext';

export interface HandoffAgent {
  readonly hostId: string;
  readonly paneId: string;
}

export interface ComposerHandoff {
  /** Adds text to the Agent's draft as its own paragraph; the user stays where they are. */
  add: (agent: HandoffAgent, text: string) => void;
  /** Takes the user to the Agent's Chat, where the draft waits for their Send. */
  open: (agent: HandoffAgent) => void;
}

let handoffs = 0;

/**
 * Puts text into an Agent's Composer from another screen. Nothing is sent: delivery stays the
 * user's tap on Send, behind every gate the Composer already has (Blocked, the program's send
 * policy). `add` then `open` hands over and goes there; `add` alone collects several pieces.
 */
export function useComposerHandoff(storage: KeyValueStorage): ComposerHandoff {
  const registry = useComposerRegistry(storage);
  const router = useRouter();
  return useMemo(
    () => ({
      add: ({ hostId, paneId }, text) => registry.appendToDraft(composerKey(hostId, paneId), text),
      open: ({ hostId, paneId }) => {
        handoffs += 1;
        // Back to the Agent's detail when it is under this screen, else in place of this screen.
        router.dismissTo(
          hrefs.agent(hostId, paneId, { surface: 'chat', request: String(handoffs) }),
        );
      },
    }),
    [registry, router],
  );
}
