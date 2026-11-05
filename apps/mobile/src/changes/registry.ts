import { ChangesStore, type Clock } from '@openagentspocket/core';
import { systemClock } from '@openagentspocket/transport';
import { DEMO_PATCH, DEMO_READ } from './demo';
import { say } from './say';

export type ChangesStoreFactory = (agentId: string) => ChangesStore;

/** Demo data until the SSH transport lands: swap with `setChangesStoreFactory` at the composition root. */
const demoFactory: ChangesStoreFactory = () =>
  new ChangesStore({
    directory: () => '/work/storefront',
    read: async () => DEMO_READ,
    readPatch: async () => DEMO_PATCH,
    listUntrackedDirectory: async (request) => ({
      directory: request.directory,
      entries: [],
      total: 0,
      isTruncated: false,
      isSeparateRepository: false,
      limitNotice: null,
    }),
    clock: systemClock,
    say,
  });

let factory: ChangesStoreFactory = demoFactory;
const stores = new Map<string, ChangesStore>();

export function setChangesStoreFactory(next: ChangesStoreFactory | undefined): void {
  factory = next ?? demoFactory;
  stores.clear();
}

/** One store per Agent while its Changes are open; `releaseChangesStore` discards it. */
export function changesStoreFor(agentId: string): ChangesStore {
  let store = stores.get(agentId);
  if (!store) {
    store = factory(agentId);
    stores.set(agentId, store);
  }
  return store;
}

export function releaseChangesStore(agentId: string): void {
  stores.get(agentId)?.cancel();
  stores.delete(agentId);
}
