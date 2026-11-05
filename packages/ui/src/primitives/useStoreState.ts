import { useSyncExternalStore } from 'react';

/** The current state of a core store; the component re-renders when it changes. */
export function useStoreState<State>(store: {
  subscribe: (listener: () => void) => () => void;
  getState: () => State;
}): State {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
