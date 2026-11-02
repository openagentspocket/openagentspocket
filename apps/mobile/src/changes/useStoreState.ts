import type { Observable } from '@openagentspocket/core';
import { useSyncExternalStore } from 'react';

/** The current state of a core store; the component re-renders when it changes. */
export function useStoreState<State>(store: Observable<State>): State {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
