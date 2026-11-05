import {
  apnsToken,
  FakeClock,
  FakeNotificationTransport,
  MemoryStorage,
  makeHost,
  NotificationRegistrationCeremony,
} from '@openagentspocket/core';
import type { AppGroupStore, SharedKeychain } from 'agentico-app-group';
import { createLiveNotificationParts } from './liveServices';

function fakeAppGroup() {
  const items = new Map<string, string>();
  const files = new Map<string, string>();
  const keychain: SharedKeychain = {
    save: (account, value) => !!items.set(account, value),
    read: (account) => items.get(account) ?? null,
    readAll: () => Object.fromEntries(items),
    remove: (account) => items.delete(account),
  };
  const group: AppGroupStore = {
    available: true,
    containerPath: async () => '/container',
    writeFile: async (name, text) => !!files.set(name, text),
    readFile: async (name) => files.get(name) ?? null,
    reloadWidgets: async () => undefined,
    requestNotificationAuthorization: async () => true,
    notificationKeychain: keychain,
  };
  return { group, items, files };
}

describe('live notification parts', () => {
  it('keeps keys in the shared Keychain and mirrors them to the App Group file on every change', async () => {
    const { group, items, files } = fakeAppGroup();
    const parts = createLiveNotificationParts({
      hosts: { getSnapshot: () => ({ hosts: [] }), subscribe: () => () => undefined },
      transports: { withTransport: () => Promise.reject(new Error('unused')) },
      appGroup: group,
      storage: new MemoryStorage(),
      clock: new FakeClock(),
      randomBytes: (n) => new Uint8Array(n).fill(9),
    });
    expect(parts.ceremony).toBeInstanceOf(NotificationRegistrationCeremony);
    parts.keys.save({ hostId: 'h1', hostName: 'One', key: new Uint8Array(32).fill(1) });
    await parts.keys.sync();
    expect(items.has('h1')).toBe(true);
    const mirror = JSON.parse(files.get('notification-keys.json') ?? '{}');
    expect(mirror.records.map((r: { host: string }) => r.host)).toEqual(['h1']);
    parts.keys.removeRecord('h1');
    await parts.keys.sync();
    expect(JSON.parse(files.get('notification-keys.json') ?? '{}').records).toEqual([]);
  });

  it('enabling a Host puts the key in the shared Keychain, mirrors it, and registers the APNs token', async () => {
    const { group, items, files } = fakeAppGroup();
    const host = makeHost('h1', { name: 'One' });
    const transport = new FakeNotificationTransport();
    const parts = createLiveNotificationParts({
      hosts: { getSnapshot: () => ({ hosts: [host] }), subscribe: () => () => undefined },
      transports: { withTransport: (_host, operation) => operation(transport) },
      appGroup: group,
      storage: new MemoryStorage(),
      clock: new FakeClock(),
      randomBytes: (n) => new Uint8Array(n).fill(7),
      tokenSource: {
        state: async () => ({ kind: 'registered', token: apnsToken('abc123', 'sandbox') }),
        enable: async () => ({ kind: 'registered', token: apnsToken('abc123', 'sandbox') }),
      },
    });
    await parts.services.pushToken.enable();
    await parts.services.store.refresh();
    await parts.services.store.setNotificationsEnabled(true, host);
    // The Keychain record is the one the extension decodes: versioned, named, base64url key.
    expect(JSON.parse(items.get('h1') ?? '{}')).toMatchObject({ v: 1, name: 'One' });
    await parts.keys.sync();
    expect(JSON.parse(files.get('notification-keys.json') ?? '{}').records).toHaveLength(1);
    // The APNs device token reached the Host's registration file, sandbox environment included.
    expect(JSON.stringify(transport.registrationJson)).toContain('abc123');
    expect(JSON.stringify(transport.registrationJson)).toContain('sandbox');
  });
});
