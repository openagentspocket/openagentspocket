import { describe, expect, it } from 'vitest';
import { FakeClock } from '../hosts/cancellation';
import type { Host } from '../hosts/host';
import { utf8Encode } from '../pairing/bytes';
import { NotificationRegistrationCeremony } from './ceremony';
import { FakeNotificationTransport, makeHost } from './fake-notification-transport';
import { MemoryNotificationKeyStore } from './key-store';
import {
  type HostNotificationState,
  NotificationPreferencesStore,
  type NotificationTransportProvider,
} from './preferences-store';
import { apnsToken, type PushDeviceToken } from './push-token';
import { DEFAULT_RELAY_BASE_URL, RETIRED_DEFAULT_RELAY_BASE_URLS } from './relay-endpoint';
import type { NotificationTransport } from './transport';

let counter = 0;
const randomBytes = (length: number) => new Uint8Array(length).fill(++counter);

function setup(
  options: {
    token?: PushDeviceToken | null;
    relay?: string | null;
    /** Every Host reads and writes one file, as Hosts of one remote user do. */
    shared?: boolean;
    clock?: FakeClock;
  } = {},
) {
  const hosts = new Map<string, FakeNotificationTransport>();
  const sharedTransport = new FakeNotificationTransport();
  const provider: NotificationTransportProvider = {
    withTransport: <T>(host: Host, operation: (t: NotificationTransport) => Promise<T>) =>
      operation(
        options.shared ? sharedTransport : (hosts.get(host.id) ?? new FakeNotificationTransport()),
      ),
  };
  const optIns = new Map<string, boolean>();
  const keys = new MemoryNotificationKeyStore();
  const store = new NotificationPreferencesStore({
    transports: provider,
    ceremony: new NotificationRegistrationCeremony(keys, randomBytes),
    deviceToken: () =>
      options.token === undefined ? apnsToken('a1b2c3', 'production') : options.token,
    relayBaseURL: () => options.relay ?? null,
    approvalOptIns: {
      setEnabled: (enabled, id) => void optIns.set(id, enabled),
      hostIds: () => [...optIns.keys()],
    },
    clock: options.clock ?? new FakeClock(),
  });
  const host = (id: string, fields: Partial<Host> = {}) => {
    const h = makeHost(id, fields);
    hosts.set(id, hosts.get(id) ?? new FakeNotificationTransport());
    return h;
  };
  const transport = (id: string) => {
    const t = options.shared ? sharedTransport : hosts.get(id);
    if (!t) throw new Error(`no transport ${id}`);
    return t;
  };
  return { store, keys, optIns, host, transport };
}

const kindOf = (store: NotificationPreferencesStore, id: string) => store.states.get(id)?.kind;
const settingsOf = (state: HostNotificationState | undefined) =>
  state && 'settings' in state ? state.settings : null;

describe('refresh', () => {
  it('reads an unregistered Host as off', async () => {
    const { store, host } = setup();
    store.setHosts([host('a')]);
    await store.refresh();
    expect(settingsOf(store.states.get('a'))?.isRegistered).toBe(false);
  });

  it('is unavailable without a push token', async () => {
    const { store, host } = setup({ token: null });
    store.setHosts([host('a')]);
    await store.refresh();
    expect(kindOf(store, 'a')).toBe('unavailable');
  });

  it('is unavailable when the Host cannot be reached', async () => {
    const { store, host, transport } = setup();
    store.setHosts([host('a')]);
    transport('a').unreachable = new Error('down');
    await store.refresh();
    expect(kindOf(store, 'a')).toBe('unavailable');
  });

  it('drops the state of a Host removed from the catalog', async () => {
    const { store, host } = setup();
    store.setHosts([host('a'), host('b')]);
    await store.refresh();
    store.setHosts([host('a')]);
    expect([...store.states.keys()]).toEqual(['a']);
  });

  it('moves a registered Host off the retired loopback relay, and leaves a custom one', async () => {
    const { store, host, transport } = setup();
    const a = host('a');
    store.setHosts([a]);
    await store.refresh();
    await store.setNotificationsEnabled(true, a);
    for (const [stored, expected] of [
      [RETIRED_DEFAULT_RELAY_BASE_URLS[0], DEFAULT_RELAY_BASE_URL],
      ['http://localhost:8787', 'http://localhost:8787'],
    ]) {
      transport('a').config = utf8Encode(JSON.stringify({ relay_url: stored, debounce_ms: 5 }));
      await store.refresh();
      expect(transport('a').configJson).toEqual({ relay_url: expected, debounce_ms: 5 });
    }
  });
});

describe('toggles', () => {
  it('enabling registers the device with both triggers on', async () => {
    const { store, host, transport } = setup();
    const a = host('a');
    store.setHosts([a]);
    await store.refresh();
    await store.setNotificationsEnabled(true, a);
    expect(store.confirmedTriggers('a')).toEqual({ blocked: true, done: true, approve: false });
    expect(transport('a').registrationJson).toMatchObject({ v: 1 });
  });

  it('disabling removes the entry and the key', async () => {
    const { store, host, keys } = setup();
    const a = host('a');
    store.setHosts([a]);
    await store.refresh();
    await store.setNotificationsEnabled(true, a);
    await store.setNotificationsEnabled(false, a);
    expect(store.confirmedTriggers('a')).toBeNull();
    expect(keys.record('a')).toBeNull();
  });

  it('a failed enable snaps back with a message and writes no flag', async () => {
    const { store, host, transport } = setup();
    const a = host('a');
    store.setHosts([a]);
    await store.refresh();
    transport('a').failWrites = true;
    await store.setNotificationsEnabled(true, a);
    const state = store.states.get('a');
    expect(state?.kind).toBe('failed');
    expect(settingsOf(state)?.isRegistered).toBe(false);
  });

  it('toggling to the current value writes nothing', async () => {
    const { store, host, transport } = setup();
    const a = host('a');
    store.setHosts([a]);
    await store.refresh();
    await store.setNotificationsEnabled(false, a);
    expect(transport('a').writes).toEqual([]);
  });

  it('the done flag rewrites the entry and keeps the others', async () => {
    const { store, host } = setup();
    const a = host('a');
    store.setHosts([a]);
    await store.refresh();
    await store.setNotificationsEnabled(true, a);
    await store.setDoneEnabled(false, a);
    expect(store.confirmedTriggers('a')).toEqual({ blocked: true, done: false, approve: false });
  });

  it('flags on an unregistered Host are ignored', async () => {
    const { store, host, transport } = setup();
    const a = host('a');
    store.setHosts([a]);
    await store.refresh();
    await store.setDoneEnabled(false, a);
    await store.setApprovalsEnabled(true, a);
    expect(transport('a').writes).toEqual([]);
  });

  it('approvals mirror the opt-in and turn off before the Host confirms', async () => {
    const { store, host, optIns, transport } = setup();
    const a = host('a');
    store.setHosts([a]);
    await store.refresh();
    await store.setNotificationsEnabled(true, a);
    await store.setApprovalsEnabled(true, a);
    expect(optIns.get('a')).toBe(true);
    transport('a').failWrites = true;
    await store.setApprovalsEnabled(false, a);
    expect(optIns.get('a')).toBe(false);
    expect(settingsOf(store.states.get('a'))?.notify.approve).toBe(true);
  });

  it('writes the custom relay into notify.json when enabling', async () => {
    const { store, host, transport } = setup({ relay: 'https://relay.example' });
    const a = host('a');
    store.setHosts([a]);
    await store.refresh();
    await store.setNotificationsEnabled(true, a);
    expect(transport('a').configJson).toEqual({ relay_url: 'https://relay.example' });
  });

  it('fires onRegistered once for a confirmed registration', async () => {
    const { store, host } = setup();
    const fired: string[] = [];
    store.onRegistered = (id) => fired.push(id);
    const a = host('a');
    store.setHosts([a]);
    await store.refresh();
    await store.setNotificationsEnabled(true, a);
    expect(fired).toEqual(['a']);
  });
});

describe('shared files', () => {
  it('another Host entry for this device does not read as registered', async () => {
    const { store, host } = setup({ shared: true });
    const a = host('a');
    const b = host('b', { sessionName: 'work' });
    store.setHosts([a, b]);
    await store.refresh();
    await store.setNotificationsEnabled(true, a);
    await store.refresh();
    expect(store.confirmedTriggers('a')).not.toBeNull();
    expect(store.confirmedTriggers('b')).toBeNull();
  });

  it('registering on an occupied session turns the displaced Host off', async () => {
    const { store, host } = setup({ shared: true });
    const a = host('a', { sessionName: 'work' });
    const b = host('b', { sessionName: 'work' });
    store.setHosts([a, b]);
    await store.refresh();
    await store.setNotificationsEnabled(true, a);
    expect(store.confirmedTriggers('a')).not.toBeNull();
    await store.setNotificationsEnabled(true, b);
    expect(store.confirmedTriggers('b')).not.toBeNull();
    expect(store.confirmedTriggers('a')).toBeNull();
  });
});

describe('host removal', () => {
  it('forgetting the key reads the Host as unregistered', async () => {
    const { store, host } = setup();
    const a = host('a');
    store.setHosts([a]);
    await store.refresh();
    await store.setNotificationsEnabled(true, a);
    store.forgetNotificationKey('a');
    expect(store.confirmedTriggers('a')).toBeNull();
    expect(store.hasNotificationKey('a')).toBe(false);
  });

  it('revoking an unconnected Host touches no transport', async () => {
    const { store, host, transport } = setup();
    const a = host('a');
    store.setHosts([a]);
    await store.refresh();
    await store.setNotificationsEnabled(true, a);
    const reads = transport('a').reads;
    await store.revokeRegistration(a, false);
    expect(transport('a').reads).toBe(reads);
  });

  it('a revoke the Host confirms reads unregistered while the key remains', async () => {
    const { store, host } = setup();
    const a = host('a');
    store.setHosts([a]);
    await store.refresh();
    await store.setNotificationsEnabled(true, a);
    await store.revokeRegistration(a, true);
    expect(store.confirmedTriggers('a')).toBeNull();
    expect(store.hasNotificationKey('a')).toBe(true);
  });

  it('a revoke that never finishes is abandoned at the deadline', async () => {
    const clock = new FakeClock();
    const { store, host, transport } = setup({ clock });
    const a = host('a');
    store.setHosts([a]);
    await store.refresh();
    await store.setNotificationsEnabled(true, a);
    transport('a').holdRegistrationWrites = new Promise(() => {});
    const finished = store.revokeRegistration(a, true, 100);
    await clock.advance(100);
    await finished;
    expect(store.confirmedTriggers('a')).not.toBeNull();
  });
});
