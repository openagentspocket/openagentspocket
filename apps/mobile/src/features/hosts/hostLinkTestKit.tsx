import {
  AgentStatusClocks,
  type ConsoleTransport,
  type EventsSessionStatus,
  MemoryStorage,
  PinnedAgents,
} from '@openagentspocket/core';
import { systemClock } from '@openagentspocket/transport';
import { waitFor } from '@testing-library/react-native';
import { ConsoleStore, type HostSummary } from '@/console/store';
import { FakeConsoleSession } from '../../../../../packages/core/src/console/testing';

// Test support: a Console with Hosts whose link a test sets by hand (no reconnects, no timers).

export type LinkCase = 'connecting' | 'live' | 'reconnecting' | 'failed' | 'stopped';

export const LINK_CASES: readonly LinkCase[] = [
  'connecting',
  'live',
  'reconnecting',
  'failed',
  'stopped',
];

const idle: ConsoleTransport = {
  sessionSnapshot: async () => ({ version: 1, workspaces: [], tabs: [], panes: [], agents: [] }),
  readPane: async () => ({ text: '' }),
} as unknown as ConsoleTransport;

const STATUS: Record<Exclude<LinkCase, 'stopped'>, EventsSessionStatus> = {
  connecting: { kind: 'connecting' },
  live: { kind: 'connected' },
  reconnecting: {
    kind: 'reconnecting',
    attempt: 3,
    delayMs: 1000,
    failure: { kind: 'timedOut' },
  },
  failed: { kind: 'failed', failure: { kind: 'authenticationFailed' } },
};

/** The link each case must read as (`hostLink`), so a test knows the store got there. */
const LINK: Record<LinkCase, HostSummary['link']> = {
  connecting: 'connecting',
  live: 'live',
  reconnecting: 'offline',
  failed: 'offline',
  stopped: 'stopped',
};

export function linkStore() {
  const store = new ConsoleStore({
    pins: new PinnedAgents(new MemoryStorage()),
    clocks: new AgentStatusClocks(new MemoryStorage()),
    clock: systemClock,
  });
  const sessions = new Map<string, FakeConsoleSession<ConsoleTransport>>();
  /** Adds a never-connected Host named after its id and brings its link to `link`. */
  const add = async (id: string, link: LinkCase): Promise<void> => {
    const session = new FakeConsoleSession(idle);
    sessions.set(id, session);
    store.addHost({ id, name: id, username: 'ada' }, session);
    if (link === 'stopped') {
      await store.stopConnecting(id);
      session.setStatus({ kind: 'suspended' });
    } else {
      session.setStatus(STATUS[link]);
    }
    await waitFor(() =>
      expect(store.getState().hosts.find((host) => host.id === id)?.link).toBe(LINK[link]),
    );
  };
  return { store, sessions, add };
}
