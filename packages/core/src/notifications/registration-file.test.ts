import { describe, expect, it } from 'vitest';
import vectors from '../../../plugin/test-vectors/notification-session-v1.json';
import { encodeBase64Url, utf8Encode } from '../pairing/bytes';
import { isJsonObject, type JsonObject, type JsonValue } from '../wire/json';
import { NotificationRegistrationError } from './errors';
import { apnsToken, fcmToken } from './push-token';
import {
  entryOwner,
  type NotificationDeviceEntry,
  NotificationRegistrationFile,
  type NotificationRegistrationOwner,
  triggerPreferences,
} from './registration-file';

/** The entry as an object; fails the test when it is not one. */
function obj(value: JsonValue | undefined): JsonObject {
  if (!isJsonObject(value)) throw new Error('not an object');
  return value;
}
const objects = (values: readonly unknown[]): JsonObject[] =>
  values.map((v) => (isJsonObject(v) ? v : {}));

const key = Uint8Array.from({ length: 32 }, (_, i) => i);
const otherKey = new Uint8Array(32).fill(7);

const entry = (fields: Partial<NotificationDeviceEntry> = {}): NotificationDeviceEntry => ({
  token: apnsToken('a1b2c3', 'production'),
  key,
  session: '',
  notify: triggerPreferences({ done: false }),
  ...fields,
});
const owner = (k: Uint8Array, session: string | null): NotificationRegistrationOwner => ({
  deviceToken: 'a1b2c3',
  key: k,
  session,
});
const decode = (text: string) => NotificationRegistrationFile.decode(utf8Encode(text));
const rawEntry = (k: Uint8Array, session: string | null, extra: JsonObject = {}): JsonObject => ({
  token: 'a1b2c3',
  key: encodeBase64Url(k),
  env: 'production',
  ...(session === null ? {} : { session }),
  notify: { blocked: true, done: true },
  ...extra,
});
const rawFile = (...devices: JsonValue[]) => decode(JSON.stringify({ v: 1, devices }));
const sessionsOf = (file: NotificationRegistrationFile, k: Uint8Array) =>
  file.devices.filter((d) => obj(d).key === encodeBase64Url(k)).map((d) => obj(d).session);

describe('decode', () => {
  it('reads an absent file as empty', () => {
    expect(NotificationRegistrationFile.decode(null).devices).toEqual([]);
  });

  it.each(['not json at all', '[1,2,3]', '{"devices":[]}', '{"v":"1","devices":[]}'])(
    'reads corrupt content %j as empty so registration self-heals',
    (text) => {
      expect(decode(text).devices).toEqual([]);
    },
  );

  it('refuses another version instead of clobbering it', () => {
    expect(() => decode('{"v":2,"devices":[{"token":"zz"}]}')).toThrow(
      NotificationRegistrationError,
    );
    try {
      decode('{"v":2,"devices":[]}');
    } catch (thrown) {
      expect(thrown instanceof NotificationRegistrationError ? thrown.failure : null).toEqual({
        kind: 'unsupportedFileVersion',
        version: 2,
      });
    }
  });
});

describe('registering', () => {
  it('encodes the contract shape with explicit flags', () => {
    const file = new NotificationRegistrationFile().registering(entry());
    const parsed = obj(JSON.parse(new TextDecoder().decode(file.encoded())));
    expect(parsed.v).toBe(1);
    expect(parsed.devices).toEqual([
      {
        token: 'a1b2c3',
        key: encodeBase64Url(key),
        env: 'production',
        session: '',
        notify: { blocked: true, done: false, approve: false },
      },
    ]);
  });

  it('marks Android entries with the platform and the fcm env', () => {
    const file = new NotificationRegistrationFile().registering(
      entry({ token: fcmToken('fcm:APA91b') }),
    );
    expect(file.devices[0]).toMatchObject({ platform: 'android', env: 'fcm', token: 'fcm:APA91b' });
    const ios = new NotificationRegistrationFile().registering(entry());
    expect(ios.devices[0]).not.toHaveProperty('platform');
  });

  it('round-trips the approve flag and reads a mistyped flag as off', () => {
    const approving = entry({ notify: triggerPreferences({ done: false, approve: true }) });
    const file = decode(
      new TextDecoder().decode(new NotificationRegistrationFile().registering(approving).encoded()),
    );
    expect(file.preferences(entryOwner(approving))?.approve).toBe(true);
    const legacy = rawFile(rawEntry(key, null, { notify: { blocked: true, approve: 'yes' } }));
    expect(legacy.preferences(owner(key, ''))).toEqual({
      blocked: true,
      done: false,
      approve: false,
    });
  });

  it('replaces its own entry when registering again', () => {
    const first = new NotificationRegistrationFile().registering(entry());
    const again = first.registering(entry({ notify: triggerPreferences({ blocked: false }) }));
    expect(again.devices).toHaveLength(1);
    expect(again.preferences(owner(key, ''))).toMatchObject({ blocked: false, done: true });
  });

  it('keeps foreign entries and their unknown fields', () => {
    const existing = decode(
      '{"v":1,"devices":[{"token":"ffff","key":"kk","env":"sandbox","notify":{"blocked":true},"future_field":"kept"}]}',
    );
    const file = decode(new TextDecoder().decode(existing.registering(entry()).encoded()));
    expect(file.devices).toHaveLength(2);
    expect(file.devices.find((d) => obj(d).token === 'ffff')).toMatchObject({
      future_field: 'kept',
    });
  });

  it('merges over the own entry so live_activity survives re-registration', () => {
    const original = rawFile(
      rawEntry(key, '', { live_activity: { token: 'la', started_at: 't' }, extra: 1 }),
    );
    const updated = original.registering(entry());
    expect(updated.devices).toHaveLength(1);
    expect(updated.devices[0]).toMatchObject({ live_activity: { token: 'la' }, extra: 1 });
  });

  it('takes the session slot, drops own duplicates, keeps other sessions', () => {
    const third = new Uint8Array(32).fill(3);
    const original = rawFile(
      rawEntry(otherKey, 'work'),
      rawEntry(key, null, { live_activity: { token: 'la', started_at: 't' } }),
      rawEntry(key, 'elsewhere'),
      rawEntry(third, 'other'),
      { token: 'ffff', key: 'zz', session: 'work' },
    );
    const registered = original.registering(entry({ session: 'work' }));
    expect(sessionsOf(registered, key)).toEqual(['work']);
    expect(registered.preferences(owner(otherKey, 'work'))).toBeNull();
    expect(registered.devices).toHaveLength(3);
    expect(registered.preferences(owner(third, 'other'))).not.toBeNull();
    expect(registered.devices.some((d) => obj(d).token === 'ffff')).toBe(true);
  });
});

describe('ownership', () => {
  it('is the entry carrying the Host key, not just the device token', () => {
    const file = rawFile(rawEntry(otherKey, '', { notify: { blocked: true, done: false } }));
    expect(file.preferences(owner(key, ''))).toBeNull();
    expect(file.preferences(owner(otherKey, ''))).toMatchObject({ done: false });
  });

  it('reads a legacy entry as registered only for the Host whose key it carries', () => {
    const file = rawFile(rawEntry(key, null));
    expect(file.preferences(owner(key, 'work'))).not.toBeNull();
    expect(file.preferences(owner(otherKey, 'work'))).toBeNull();
  });

  it('reads an absent device token as unregistered', () => {
    const file = new NotificationRegistrationFile().registering(entry());
    expect(file.preferences({ deviceToken: 'nope', key, session: '' })).toBeNull();
  });
});

describe('removing', () => {
  it('drops every own entry and nothing else', () => {
    const original = rawFile(rawEntry(key, ''), rawEntry(key, 'x'), rawEntry(otherKey, ''));
    const removed = original.removing(owner(key, ''));
    expect(removed.devices).toHaveLength(1);
    expect(removed.preferences(owner(otherKey, ''))).not.toBeNull();
  });

  it('changes nothing for an unregistered Host', () => {
    const file = new NotificationRegistrationFile().registering(entry());
    expect(file.removing(owner(new Uint8Array(32).fill(1), '')).equals(file)).toBe(true);
  });

  it('removes by key whatever the device token', () => {
    const older = { ...rawEntry(key, ''), token: 'older-token' };
    const file = rawFile(older, rawEntry(otherKey, ''));
    expect(file.removingKey(key).devices).toHaveLength(1);
  });
});

describe('normalized', () => {
  it('moves a legacy own entry to the session keeping its fields', () => {
    const legacy = rawFile(
      rawEntry(key, null, {
        future_field: 'kept',
        live_activity: { token: 'la', started_at: 't' },
      }),
    );
    const normalized = legacy.normalized(owner(key, 'work'));
    expect(sessionsOf(normalized, key)).toEqual(['work']);
    expect(normalized.devices[0]).toMatchObject({
      future_field: 'kept',
      live_activity: { token: 'la' },
    });
    expect(normalized.normalized(owner(key, 'work')).equals(normalized)).toBe(true);
  });

  it('follows an edited session', () => {
    const normalized = rawFile(rawEntry(key, 'old')).normalized(owner(key, 'new'));
    expect(sessionsOf(normalized, key)).toEqual(['new']);
  });

  it('drops the own entry when another Host holds the slot', () => {
    const original = rawFile(rawEntry(key, null), rawEntry(otherKey, 'work'));
    const normalized = original.normalized(owner(key, 'work'));
    expect(normalized.preferences(owner(key, 'work'))).toBeNull();
    expect(normalized.devices).toHaveLength(1);
  });

  it('collapses duplicates keeping the current session', () => {
    const original = rawFile(
      rawEntry(key, '', { notify: { blocked: true, done: false } }),
      rawEntry(key, 'work'),
    );
    const normalized = original.normalized(owner(key, 'work'));
    expect(sessionsOf(normalized, key)).toEqual(['work']);
    expect(normalized.preferences(owner(key, 'work'))?.done).toBe(true);
  });

  it('changes nothing without a known session or an own entry', () => {
    const original = rawFile(rawEntry(key, null), rawEntry(otherKey, 'x'));
    expect(original.normalized(owner(key, null))).toBe(original);
    expect(original.normalized(owner(new Uint8Array(32), 'x'))).toBe(original);
  });
});

describe('shared session vector', () => {
  const token = 'a1b2c3';
  const ownKey = new Uint8Array(32).fill(0xee);
  const keyAt = (index: number) => new Uint8Array(32).fill(index + 1);
  /** The plugin's delivery rule: legacy entries reach every hook, others their exact session. */
  const delivers = (device: JsonValue, hookSession: string | null) => {
    const session = obj(device).session;
    return typeof session !== 'string' || session === hookSession;
  };
  const fileOf = (entries: JsonObject[]) =>
    rawFile(
      ...entries.map((e, index) => ({
        ...e,
        token,
        key: encodeBase64Url(keyAt(index)),
        env: 'production',
        notify: { blocked: true, done: true },
      })),
    );

  it('has cases', () => {
    expect(vectors.delivery.length).toBeGreaterThan(3);
  });

  it.each(vectors.delivery.filter((v) => v.ownSession !== null))(
    'reaches a registered Host only through its own session: $name',
    (vector) => {
      const session = vector.ownSession ?? '';
      const registered = fileOf(objects(vector.entries)).registering({
        token: apnsToken(token, 'production'),
        key: ownKey,
        session,
        notify: triggerPreferences(),
      });
      const hooks = new Set<string>(['', ...vectors.delivery.flatMap((v) => v.ownSession ?? [])]);
      for (const hook of hooks) {
        const reached = registered.devices.filter(
          (d) => delivers(d, hook) && typeof obj(d).session === 'string',
        );
        const own = reached.filter((d) => obj(d).key === encodeBase64Url(ownKey));
        if (hook === session) {
          expect(reached).toHaveLength(1);
          expect(own).toHaveLength(1);
        } else {
          expect(own).toHaveLength(0);
        }
      }
    },
  );

  it.each(vectors.delivery.filter((v) => v.ownSession !== null))(
    'moves a legacy entry into its Host session: $name',
    (vector) => {
      const session = vector.ownSession ?? '';
      const entries = objects(vector.entries);
      const file = fileOf(entries);
      entries.forEach((e, index) => {
        if (typeof e.session === 'string') return;
        const normalized = file.normalized({ deviceToken: token, key: keyAt(index), session });
        const own = normalized.devices.filter((d) => obj(d).key === encodeBase64Url(keyAt(index)));
        expect(own.length).toBeLessThanOrEqual(1);
        if (own[0]) expect(obj(own[0]).session).toBe(session);
        const reached = normalized.devices.filter(
          (d) => delivers(d, session) && typeof obj(d).session === 'string',
        );
        expect(reached.length).toBeLessThanOrEqual(1);
      });
    },
  );
});
