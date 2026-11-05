import {
  type ConsoleRow,
  type ConsoleTerminal,
  findRow,
  nextTransition,
  type StatusInboxItem,
  type StatusInboxSection,
  statusInboxItems,
} from '@openagentspocket/core';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { createDemoConsoleStore } from './demo';
import type { ConsoleState, ConsoleStore } from './store';

let fallback: ConsoleStore | undefined;

/** The demo store until the live one is provided; created on first use. */
function defaultStore(): ConsoleStore {
  fallback ??= createDemoConsoleStore();
  return fallback;
}

const StoreContext = createContext<ConsoleStore | undefined>(undefined);

export function ConsoleStoreProvider({
  store,
  children,
}: {
  store: ConsoleStore;
  children: ReactNode;
}) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useConsoleStore(): ConsoleStore {
  return useContext(StoreContext) ?? defaultStore();
}

/** The whole Console state; re-renders on every change. */
export function useConsoleState(): ConsoleState {
  const store = useConsoleStore();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

/** Every Host's Agents in Console order. */
export function useConsole(): readonly ConsoleRow[] {
  return useConsoleState().rows;
}

/** Every Host's shell panes (no Agent), re-read when the Console changes. */
export function useConsoleTerminals(): readonly ConsoleTerminal[] {
  const store = useConsoleStore();
  const { revision } = useConsoleState();
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision signals a new snapshot
  return useMemo(() => store.terminals(), [store, revision]);
}

/** One Agent by key (see `agentKey`); undefined when it is not listed. */
export function useAgent(key: string): ConsoleRow | undefined {
  return findRow(useConsole(), key);
}

/** Status Inbox sections, re-evaluated when the rows change or a timed transition comes due. */
export function useStatusInbox(): Partial<Record<StatusInboxSection, StatusInboxItem[]>> {
  const store = useConsoleStore();
  const { rows, revision } = useConsoleState();
  const [now, setNow] = useState(() => Date.now());
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision signals clock changes
  const due = useMemo(
    () => nextTransition(rows, (key) => store.stamp(key), now),
    [rows, store, now, revision],
  );
  useEffect(() => {
    if (due === undefined) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, due - Date.now()));
    return () => clearTimeout(timer);
  }, [due]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision signals clock changes
  return useMemo(
    () =>
      statusInboxItems({
        rows,
        stamps: (key) => store.stamp(key),
        pinRank: (row) => (store.isPinned(row.hostId, row.agent.pane_id) ? 0 : undefined),
        lastMessage: () => undefined,
        savedKeys: new Set(),
        now: Date.now(),
      }),
    [rows, store, now, revision],
  );
}
