import { describe, expect, it, vi } from 'vitest';
import { TransportFailure } from '../errors';
import { FakeClock } from '../hosts/cancellation';
import type { Host } from '../hosts/host';
import { MemoryStorage } from '../hosts/known-hosts';
import { NotificationRegistrationCeremony } from './ceremony';
import { NotificationRegistrationError } from './errors';
import { FakeNotificationTransport, makeHost } from './fake-notification-transport';
import { MemoryNotificationKeyStore } from './key-store';
import {
  combinedDelivery,
  hostDelivery,
  NotificationPrimerRecord,
  PRIMER_SETTING_KEY,
  type PrimerFacts,
  primerStep,
  registerUnregisteredHosts,
  turnOnNotifications,
} from './permission-primer';
import {
  NotificationPreferencesStore,
  type NotificationTransportProvider,
} from './preferences-store';
import { apnsToken, type PushRegistrationState } from './push-token';
import type { NotificationTransport } from './transport';

const ready: PrimerFacts = {
  phase: 'pending',
  freshInstall: true,
  demo: false,
  hostConnected: true,
  homeIdle: true,
  permission: 'needsPermission',
  delivery: 'yes',
  agentBlocked: false,
};
const kind = (facts: Partial<PrimerFacts>) => primerStep({ ...ready, ...facts }).kind;

describe('primerStep: the sheet after the first Host', () => {
  it('shows the sheet once a Host is connected, Home is idle and the permission is not asked', () => {
    expect(kind({})).toBe('showSheet');
  });
  it('never in demo mode, and never again once done', () => {
    expect(kind({ demo: true })).toBe('wait');
    expect(kind({ phase: 'done' })).toBe('wait');
  });
  it('waits for a connected Host (never at launch) and for Home to be idle', () => {
    expect(kind({ hostConnected: false })).toBe('wait');
    expect(kind({ homeIdle: false })).toBe('wait');
  });
  it('waits while the permission is still being read', () => {
    expect(kind({ permission: 'unknown' })).toBe('wait');
    expect(kind({ permission: 'waitingForToken' })).toBe('wait');
  });
  it('a denied permission finishes without the sheet (Settings explains it)', () => {
    expect(kind({ permission: 'denied' })).toBe('finish');
    expect(kind({ permission: 'failed' })).toBe('finish');
  });
  it('an already granted permission registers on a new install and only finishes on an update', () => {
    expect(kind({ permission: 'registered' })).toBe('register');
    expect(kind({ permission: 'registered', freshInstall: false })).toBe('finish');
  });
  it('asks the Hosts first, and waits while none can deliver', () => {
    expect(kind({ delivery: 'unknown' })).toBe('probe');
    expect(kind({ delivery: 'no' })).toBe('wait');
  });
});

describe('primerStep: the reminder after Not Now', () => {
  const declined = { phase: 'declined' as const };
  it('starts the reminder the first time an Agent is blocked in the foreground', () => {
    expect(kind({ ...declined })).toBe('wait');
    expect(kind({ ...declined, agentBlocked: true })).toBe('remind');
    expect(kind({ ...declined, agentBlocked: true, homeIdle: false })).toBe('wait');
    expect(kind({ ...declined, agentBlocked: true, demo: true })).toBe('wait');
  });
  it('stops reminding once the permission was answered elsewhere', () => {
    expect(kind({ ...declined, permission: 'registered' })).toBe('finish');
    expect(kind({ ...declined, permission: 'denied' })).toBe('finish');
  });
  it('keeps the banner while the permission is still not asked', () => {
    expect(kind({ phase: 'reminding', agentBlocked: false, homeIdle: false })).toBe('showBanner');
    expect(kind({ phase: 'reminding', permission: 'registered' })).toBe('finish');
  });
});

describe('combinedDelivery', () => {
  it('one Host that can is enough; a Host not asked yet asks; otherwise no', () => {
    expect(combinedDelivery(['no', 'yes'])).toBe('yes');
    expect(combinedDelivery(['no', undefined])).toBe('unknown');
    expect(combinedDelivery(['no', 'no'])).toBe('no');
    expect(combinedDelivery(['no', 'unknown'])).toBe('no');
  });
});

function provider(failure?: unknown): NotificationTransportProvider {
  return {
    withTransport: async <T>(_host: Host, operation: (t: NotificationTransport) => Promise<T>) => {
      if (failure) throw failure;
      return operation(new FakeNotificationTransport());
    },
  };
}

describe('hostDelivery', () => {
  const host = makeHost('a');
  it('a readable registration file means the plugin can deliver', async () => {
    expect(await hostDelivery(provider(), host)).toBe('yes');
  });
  it('a missing plugin cannot; any other failure is unknown', async () => {
    const missing = new NotificationRegistrationError({ kind: 'pluginNotInstalled' });
    expect(await hostDelivery(provider(missing), host)).toBe('no');
    expect(await hostDelivery(provider(new TransportFailure({ kind: 'timedOut' })), host)).toBe(
      'unknown',
    );
  });
});

function twoHostStore() {
  const transports = new Map([
    ['a', new FakeNotificationTransport()],
    ['b', new FakeNotificationTransport()],
  ]);
  const store = new NotificationPreferencesStore({
    transports: {
      withTransport: (host, operation) =>
        operation(transports.get(host.id) ?? new FakeNotificationTransport()),
    },
    ceremony: new NotificationRegistrationCeremony(new MemoryNotificationKeyStore(), (n) =>
      new Uint8Array(n).fill(7),
    ),
    deviceToken: () => apnsToken('a1b2c3', 'production'),
    clock: new FakeClock(),
  });
  store.setHosts([makeHost('a'), makeHost('b')]);
  return { store, transports };
}

const registered = (store: NotificationPreferencesStore, id: string) => {
  const state = store.states.get(id);
  return state?.kind === 'idle' && state.settings.isRegistered;
};

describe('registerUnregisteredHosts', () => {
  it('registers every Host this device is not registered with, keeping the rest', async () => {
    const { store, transports } = twoHostStore();
    await registerUnregisteredHosts(store);
    expect(registered(store, 'a') && registered(store, 'b')).toBe(true);
    const writes = transports.get('a')?.writes.length ?? 0;
    await registerUnregisteredHosts(store);
    expect(transports.get('a')?.writes.length).toBe(writes);
  });
});

describe('turnOnNotifications', () => {
  const source = (result: PushRegistrationState) => {
    const enable = vi.fn(async () => result);
    return { enable, state: vi.fn(async () => result) };
  };
  it('asks once, then registers the Hosts when the token arrived', async () => {
    const { store } = twoHostStore();
    const pushToken = source({ kind: 'registered', token: apnsToken('a1b2c3', 'production') });
    await turnOnNotifications(pushToken, store);
    expect(pushToken.enable).toHaveBeenCalledTimes(1);
    expect(registered(store, 'a') && registered(store, 'b')).toBe(true);
  });
  it('a refused permission registers nothing', async () => {
    const { store, transports } = twoHostStore();
    const pushToken = source({ kind: 'denied' });
    expect((await turnOnNotifications(pushToken, store)).kind).toBe('denied');
    expect(transports.get('a')?.writes).toEqual([]);
  });
});

describe('NotificationPrimerRecord', () => {
  it('a new install starts pending and fresh, and remembers it', () => {
    const storage = new MemoryStorage();
    const record = new NotificationPrimerRecord(storage, () => false);
    expect(record.phase).toBe('pending');
    expect(record.freshInstall).toBe(true);
    expect(storage.getString(PRIMER_SETTING_KEY)).toBeDefined();
    expect(new NotificationPrimerRecord(storage, () => true).freshInstall).toBe(true);
  });
  it('an app that already had Hosts is an update', () => {
    expect(new NotificationPrimerRecord(new MemoryStorage(), () => true).freshInstall).toBe(false);
  });
  it('Not Now is remembered across launches, and done is final', () => {
    const storage = new MemoryStorage();
    const record = new NotificationPrimerRecord(storage, () => false);
    let changes = 0;
    record.subscribe(() => changes++);
    record.set('declined');
    expect(new NotificationPrimerRecord(storage, () => false).phase).toBe('declined');
    record.set('done');
    record.set('pending');
    expect(record.phase).toBe('done');
    expect(changes).toBe(2);
  });
  it('an unreadable record starts over', () => {
    const storage = new MemoryStorage();
    storage.set(PRIMER_SETTING_KEY, '{"phase":"nope"}');
    expect(new NotificationPrimerRecord(storage, () => false).phase).toBe('pending');
  });
});
