import {
  type AnsiScreen,
  type ChatUnavailableReason,
  type ConversationState,
  type ConversationStore,
  initialSnapshot,
  type SentMessage,
} from '@openagentspocket/core';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import type { ConversationRegistry } from './ConversationRegistry';

const RegistryContext = createContext<ConversationRegistry | undefined>(undefined);

export function ConversationsProvider({
  registry,
  children,
}: {
  registry: ConversationRegistry;
  children: ReactNode;
}) {
  return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>;
}

/** The registry the app provides (undefined in demo mode and isolated screens). */
export const useConversationRegistry = () => useContext(RegistryContext);

const UNSUPPORTED: ChatUnavailableReason = { kind: 'unsupportedSession' };
const NO_OUTPUTS: ConversationState['outputs'] = new Map();

/** What the hook returns while no live registry is provided (demo mode, isolated screens). */
const inertState: ConversationState = {
  snapshot: {
    ...initialSnapshot(),
    phase: { type: 'unavailable', reason: UNSUPPORTED },
  },
  workflowProgress: {},
  outputs: NO_OUTPUTS,
  version: 0,
};
const inertSubscribe = () => () => undefined;
const inertState$ = () => inertState;

export interface ConversationHandle {
  readonly state: ConversationState;
  /** Reads one page above the oldest message shown. `automatic`: the timeline asks, not the user. */
  loadOlder(automatic?: boolean): void;
  /** Reads a tool row's output again for its expanded row. */
  loadOutput(entryId: string): void;
  /** Looks for the transcript again now. */
  retry(): void;
  /** The messages Chat's Composer holds (`sentMessages`): each is followed until the transcript records it. */
  updateSends(messages: readonly SentMessage[]): void;
  /** Why a send the input box would take waits all the same, or null. */
  sendConcern(outgoing: string, screen: AnsiScreen): string | null;
  /** The Agent's screen was read for another reason; a returned send it no longer holds is discarded. */
  inputBoxWasRead(screen: AnsiScreen): void;
}

/**
 * The conversation of one Agent for the chat UI: follows it while the component is mounted and
 * `follows` holds (the store reads the Host, saves on unmount) and re-renders on every change.
 */
export function useConversation(
  hostId: string,
  paneId: string,
  follows = true,
): ConversationHandle {
  const registry = useContext(RegistryContext);
  const store: ConversationStore | null = useMemo(
    () => registry?.get(hostId, paneId) ?? null,
    [registry, hostId, paneId],
  );
  useEffect(() => {
    if (!store || !follows) return;
    const viewer = Symbol('conversation-view');
    store.show(viewer);
    return () => store.hide(viewer);
  }, [store, follows]);
  const state = useSyncExternalStore(
    store?.subscribe ?? inertSubscribe,
    store?.getState ?? inertState$,
    store?.getState ?? inertState$,
  );
  return useMemo(
    () => ({
      state,
      loadOlder: (automatic = false) => store?.loadOlder(automatic),
      loadOutput: (entryId: string) => store?.loadOutput(entryId),
      retry: () => store?.retry(),
      updateSends: (messages) => store?.updateSends(messages),
      sendConcern: (outgoing, screen) => store?.sendConcern(outgoing, screen) ?? null,
      inputBoxWasRead: (screen) => store?.inputBoxWasRead(screen),
    }),
    [state, store],
  );
}
