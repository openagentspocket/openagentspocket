import {
  type ChatUnavailableReason,
  type ConversationState,
  type ConversationStore,
  initialSnapshot,
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
}

/**
 * The conversation of one Agent for the chat UI: follows it while the component is mounted (the
 * store reads the Host, saves on unmount) and re-renders on every change.
 */
export function useConversation(hostId: string, paneId: string): ConversationHandle {
  const registry = useContext(RegistryContext);
  const store: ConversationStore | null = useMemo(
    () => registry?.get(hostId, paneId) ?? null,
    [registry, hostId, paneId],
  );
  useEffect(() => {
    if (!store) return;
    const viewer = Symbol('conversation-view');
    store.show(viewer);
    return () => store.hide(viewer);
  }, [store]);
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
    }),
    [state, store],
  );
}
