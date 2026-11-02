import { consoleSubscriptions, EventsSession } from '@openagentspocket/core';
import { createDemoConsoleStore } from '@/console/demo';
import type { ConsoleStore } from '@/console/store';
import { systemClock } from '@/console/systemClock';

const neverConnects = () =>
  new EventsSession({
    subscriptions: consoleSubscriptions([]),
    connect: async () => {
      throw new Error('unreachable');
    },
    clock: systemClock,
    keepalive: null,
  });

/** The demo Console plus two Hosts that never connect: their "is offline" lines lead Home. */
export function offlineHostsStore(): ConsoleStore {
  const store = createDemoConsoleStore();
  store.addHost({ id: 'lab', name: 'Lab', username: 'ada' }, neverConnects());
  store.addHost({ id: 'pi', name: 'Raspberry Pi', username: 'ada' }, neverConnects());
  return store;
}
