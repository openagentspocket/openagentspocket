import { describe, expect, it } from 'vitest';
import { makeHerdrEndpoint } from '../hosts/herdr-endpoint';
import { encodeBase64Url } from '../pairing/bytes';
import { isJsonObject } from '../wire/json';
import {
  hostNotificationSession,
  NotificationRegistrationCeremony,
  RegistrationGate,
} from './ceremony';
import { NotificationRegistrationError } from './errors';
import { FakeNotificationTransport, makeHost } from './fake-notification-transport';
import { MemoryNotificationKeyStore, notificationKeyId } from './key-store';
import { apnsToken } from './push-token';
import { triggerPreferences } from './registration-file';
import { DEFAULT_RELAY_BASE_URL } from './relay-endpoint';

let counter = 0;
const randomBytes = (length: number) => new Uint8Array(length).fill(++counter);
const token = apnsToken('a1b2c3', 'production');

function setup() {
  const keys = new MemoryNotificationKeyStore();
  const ceremony = new NotificationRegistrationCeremony(keys, randomBytes);
  return { keys, ceremony, transport: new FakeNotificationTransport() };
}

function devices(transport: FakeNotificationTransport): unknown[] {
  const file = transport.registrationJson;
  return isJsonObject(file) && Array.isArray(file.devices) ? file.devices : [];
}

describe('hostNotificationSession', () => {
  it('is blank for the default session and the name for a named one', () => {
    expect(hostNotificationSession(makeHost('a'))).toBe('');
    expect(hostNotificationSession(makeHost('a', { sessionName: ' work ' }))).toBe('work');
  });

  it('reads the session an endpoint socket names', () => {
    const endpoint = makeHerdrEndpoint(
      '/home/ada/.config/herdr/sessions/work/herdr.sock',
      '/opt/example/bin/herdr',
    );
    expect(hostNotificationSession(makeHost('a', { herdrEndpoint: endpoint }))).toBe('work');
  });
});

describe('register', () => {
  it('writes a conformant entry and persists the key', async () => {
    const { keys, ceremony, transport } = setup();
    const host = makeHost('h1', { sessionName: 'work' });
    await ceremony.register({ host, deviceToken: token, transport });
    const record = keys.record('h1');
    expect(record?.key).toHaveLength(32);
    expect(devices(transport)).toEqual([
      {
        token: 'a1b2c3',
        key: encodeBase64Url(record?.key ?? new Uint8Array()),
        env: 'production',
        session: 'work',
        notify: { blocked: true, done: true, approve: false },
      },
    ]);
  });

  it('is idempotent and reuses the stored key', async () => {
    const { keys, ceremony, transport } = setup();
    const host = makeHost('h1');
    await ceremony.register({ host, deviceToken: token, transport });
    const first = keys.record('h1')?.key;
    await ceremony.register({
      host,
      deviceToken: token,
      notify: triggerPreferences({ done: false }),
      transport,
    });
    expect(keys.record('h1')?.key).toEqual(first);
    expect(devices(transport)).toHaveLength(1);
  });

  it('keeps separate entries for Hosts on different sessions of one file', async () => {
    const { ceremony, transport } = setup();
    await ceremony.register({ host: makeHost('a'), deviceToken: token, transport });
    await ceremony.register({
      host: makeHost('b', { sessionName: 'work' }),
      deviceToken: token,
      transport,
    });
    expect(devices(transport)).toHaveLength(2);
  });

  it('writes the default relay, then a custom one preserving other config fields', async () => {
    const { ceremony, transport } = setup();
    const host = makeHost('h1');
    await ceremony.register({ host, deviceToken: token, transport });
    expect(transport.configJson).toEqual({ relay_url: DEFAULT_RELAY_BASE_URL });
    await ceremony.register({
      host,
      deviceToken: token,
      relayBaseURL: 'https://relay.example/',
      transport,
    });
    expect(transport.configJson).toEqual({ relay_url: 'https://relay.example' });
  });

  it('preserves the plugin knobs in notify.json and skips an unchanged rewrite', async () => {
    const { ceremony, transport } = setup();
    transport.config = new TextEncoder().encode(
      JSON.stringify({ debounce_ms: 5, relay_url: DEFAULT_RELAY_BASE_URL }),
    );
    await ceremony.register({ host: makeHost('h1'), deviceToken: token, transport });
    expect(transport.writes).toEqual(['registration']);
    expect(transport.configJson).toMatchObject({ debounce_ms: 5 });
  });

  it('keeps the key for retry when the write fails', async () => {
    const { keys, ceremony, transport } = setup();
    transport.failWrites = true;
    await expect(
      ceremony.register({ host: makeHost('h1'), deviceToken: token, transport }),
    ).rejects.toBeInstanceOf(NotificationRegistrationError);
    expect(keys.record('h1')).not.toBeNull();
  });

  it('refuses to clobber a newer file version', async () => {
    const { ceremony } = setup();
    const transport = new FakeNotificationTransport('{"v":2,"devices":[]}');
    await expect(
      ceremony.register({ host: makeHost('h1'), deviceToken: token, transport }),
    ).rejects.toMatchObject({ failure: { kind: 'unsupportedFileVersion', version: 2 } });
    expect(transport.writes).toEqual([]);
  });

  it('keeps both entries of interleaved registrations through the shared gate', async () => {
    const gate = new RegistrationGate();
    const keys = new MemoryNotificationKeyStore();
    const ceremony = new NotificationRegistrationCeremony(keys, randomBytes, gate);
    const transport = new FakeNotificationTransport();
    await Promise.all([
      ceremony.register({ host: makeHost('a'), deviceToken: token, transport }),
      ceremony.register({
        host: makeHost('b', { sessionName: 'work' }),
        deviceToken: token,
        transport,
      }),
    ]);
    expect(devices(transport)).toHaveLength(2);
  });
});

describe('remove and revoke', () => {
  it('remove deletes only our entry and the local key', async () => {
    const { keys, ceremony, transport } = setup();
    await ceremony.register({ host: makeHost('a'), deviceToken: token, transport });
    await ceremony.register({
      host: makeHost('b', { sessionName: 'work' }),
      deviceToken: token,
      transport,
    });
    await ceremony.remove(makeHost('a'), token, transport);
    expect(devices(transport)).toHaveLength(1);
    expect(keys.record('a')).toBeNull();
    expect(keys.record('b')).not.toBeNull();
  });

  it('remove with no Host file still clears the key without writing', async () => {
    const { keys, ceremony, transport } = setup();
    keys.save({ hostId: 'a', hostName: 'A', key: randomBytes(32) });
    await ceremony.remove(makeHost('a'), token, transport);
    expect(transport.writes).toEqual([]);
    expect(keys.record('a')).toBeNull();
  });

  it('a failed remote removal keeps the key', async () => {
    const { keys, ceremony, transport } = setup();
    await ceremony.register({ host: makeHost('a'), deviceToken: token, transport });
    transport.failWrites = true;
    await expect(ceremony.remove(makeHost('a'), token, transport)).rejects.toBeInstanceOf(
      NotificationRegistrationError,
    );
    expect(keys.record('a')).not.toBeNull();
  });

  it('revoke drops the entry under an older token and keeps the key', async () => {
    const { keys, ceremony, transport } = setup();
    await ceremony.register({
      host: makeHost('a'),
      deviceToken: apnsToken('older', 'production'),
      transport,
    });
    await ceremony.revoke(makeHost('a'), transport);
    expect(devices(transport)).toEqual([]);
    expect(keys.record('a')).not.toBeNull();
  });

  it('revoke without a key touches nothing', async () => {
    const { ceremony, transport } = setup();
    await ceremony.revoke(makeHost('a'), transport);
    expect(transport.reads).toBe(0);
  });
});

describe('migrate', () => {
  it('moves a legacy entry to the Host session and is idempotent', async () => {
    const { keys, ceremony, transport } = setup();
    const host = makeHost('a', { sessionName: 'work' });
    keys.save({ hostId: 'a', hostName: 'A', key: randomBytes(32) });
    const key = encodeBase64Url(keys.record('a')?.key ?? new Uint8Array());
    transport.registration = new TextEncoder().encode(
      JSON.stringify({ v: 1, devices: [{ token: 'a1b2c3', key, env: 'production', extra: 1 }] }),
    );
    await ceremony.migrate(host, token, transport);
    expect(devices(transport)).toEqual([
      { token: 'a1b2c3', key, env: 'production', extra: 1, session: 'work' },
    ]);
    await ceremony.migrate(host, token, transport);
    expect(transport.writes).toEqual(['registration']);
  });
});

describe('key ids', () => {
  it('derives 8 bytes of the key hash', () => {
    expect(notificationKeyId(new Uint8Array(32))).toHaveLength(8);
  });
});
