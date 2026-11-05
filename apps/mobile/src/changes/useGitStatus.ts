import {
  type ChangesState,
  type ChangesStore,
  type GitStatus,
  gitStatusOfState,
} from '@openagentspocket/core';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { rowChanges } from './rowChanges';

const NEVER = () => () => {};
const NOTHING = () => null;

/**
 * The git status of a Host directory (branch, ahead/behind, changed/untracked/conflict counts, line
 * totals), or null until a read has completed or when there is nothing to read. Watching shares
 * one store per directory and starts its reads (settle, each exit from Working of `paneId`, a
 * bounded interval); the last watcher to leave stops them. Rows, the status line and the Board use it.
 */
export function useGitStatus(
  hostId: string,
  directory: string | undefined,
  paneId?: string,
): GitStatus | null {
  const [store, setStore] = useState<ChangesStore | null>(null);
  useEffect(() => {
    if (directory === undefined) {
      setStore(null);
      return;
    }
    const watch = rowChanges().watch({ hostId, directory, paneId });
    setStore(watch?.store ?? null);
    return () => watch?.release();
  }, [hostId, directory, paneId]);
  const subscribe = useCallback(
    (listener: () => void) => store?.subscribe(listener) ?? NEVER(),
    [store],
  );
  const state: ChangesState | null = useSyncExternalStore(
    subscribe,
    store ? store.getState : NOTHING,
    store ? store.getState : NOTHING,
  );
  return useMemo(() => (state ? gitStatusOfState(state) : null), [state]);
}
