import { consoleSubscriptions, EventsSession } from '@openagentspocket/core';
import { createDemoConsoleStore } from '@/console/demo';
import type { ConsoleStore } from '@/console/store';
import { systemClock } from '@/console/systemClock';

/** The demo Console plus a Host that never connects: its "is offline" line leads Home. */
export function offlineHostsStore(): ConsoleStore {
  const store = createDemoConsoleStore();
  const session = new EventsSession({
    subscriptions: consoleSubscriptions([]),
    connect: async () => {
      throw new Error('unreachable');
    },
    clock: systemClock,
    keepalive: null,
  });
  store.addHost({ id: 'lab', name: 'Lab', username: 'ada' }, session);
  return store;
}
