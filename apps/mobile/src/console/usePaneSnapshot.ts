import { PaneSnapshotCache, SNAPSHOT_READ_LINES } from '@openagentspocket/core';
import { useEffect, useSyncExternalStore } from 'react';
import { useConsoleStore } from './hooks';
import type { ConsoleStore } from './store';

/** While a pane's Agent works its thumbnail is asked again this often (the cache still rate-limits). */
const WORKING_REFRESH_MS = 15_000;

const caches = new WeakMap<ConsoleStore, PaneSnapshotCache>();

/** One cache per Console store: every thumbnail reads through the Host's Transport, a few at a time. */
function cacheFor(store: ConsoleStore): PaneSnapshotCache {
  let cache = caches.get(store);
  if (!cache) {
    cache = new PaneSnapshotCache({
      now: () => Date.now(),
      read: async (hostId, paneId) =>
        (
          await store.withTransport(hostId, (transport) =>
            transport.readPane({
              paneId,
              source: 'recent',
              lines: SNAPSHOT_READ_LINES,
              stripAnsi: true,
            }),
          )
        ).text,
    });
    caches.set(store, cache);
  }
  return cache;
}

/**
 * The last lines of a pane, from the shared cache: the cached thumbnail at once, a read when it is
 * stale, and a periodic one while the Agent is working. `undefined` until the first read lands.
 */
export function usePaneSnapshot(
  hostId: string,
  paneId: string,
  working: boolean,
): readonly string[] | undefined {
  const store = useConsoleStore();
  const cache = cacheFor(store);
  const lines = useSyncExternalStore(
    cache.subscribe,
    () => cache.get(hostId, paneId),
    () => undefined,
  );
  useEffect(() => {
    cache.request(hostId, paneId);
    if (!working) return;
    const timer = setInterval(() => cache.request(hostId, paneId), WORKING_REFRESH_MS);
    return () => clearInterval(timer);
  }, [cache, hostId, paneId, working]);
  return lines;
}
