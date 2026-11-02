import { encodeBase64Url, utf8Decode, utf8Encode } from '../pairing/bytes';
import type { JsonObject, JsonValue } from '../wire/json';
import { NotificationRegistrationError } from './errors';
import { encodeSortedJson, isTrueField, jsonEqual, mergeFields, stringField } from './json';
import type { PushDeviceToken } from './push-token';

/**
 * The `notify` flags of a registration entry: which Agent Status transitions this device wants
 * pushed. Per the v1 contract a missing flag means "do not send", so all are written explicitly.
 */
export interface NotificationTriggerPreferences {
  readonly blocked: boolean;
  readonly done: boolean;
  /** Approve and Deny from Blocked notifications: off until the user turns it on for the Host. */
  readonly approve: boolean;
}

export function triggerPreferences(
  fields: Partial<NotificationTriggerPreferences> = {},
): NotificationTriggerPreferences {
  return { blocked: true, done: true, approve: false, ...fields };
}

/** One v1 device entry as this device writes it. */
export interface NotificationDeviceEntry {
  readonly token: PushDeviceToken;
  /** Raw 32-byte Notification Key; unpadded base64url on the wire. */
  readonly key: Uint8Array;
  /** The herdr session the Host targets: "" for the default session, else its name. */
  readonly session: string;
  readonly notify: NotificationTriggerPreferences;
}

/**
 * Identifies one Host's own entry: this device's push token plus that Host's Notification Key.
 * Keys are random per Host, so an entry carrying the key always belongs to that Host; the token
 * alone does not (Hosts on several herdr sessions of one remote user share one file).
 */
export interface NotificationRegistrationOwner {
  readonly deviceToken: string;
  readonly key: Uint8Array;
  /** The session the Host targets now; null when unknown, then nothing is normalized. */
  readonly session: string | null;
}

export function entryOwner(entry: NotificationDeviceEntry): NotificationRegistrationOwner {
  return { deviceToken: entry.token.token, key: entry.key, session: entry.session };
}

function entryWire(entry: NotificationDeviceEntry): JsonObject {
  return {
    token: entry.token.token,
    key: encodeBase64Url(entry.key),
    env: entry.token.env,
    ...(entry.token.platform === 'android' ? { platform: 'android' } : {}),
    session: entry.session,
    notify: {
      blocked: entry.notify.blocked,
      done: entry.notify.done,
      approve: entry.notify.approve,
    },
  };
}

function owns(owner: NotificationRegistrationOwner, device: JsonValue): boolean {
  return (
    stringField(device, 'token') === owner.deviceToken &&
    stringField(device, 'key') === encodeBase64Url(owner.key)
  );
}

/**
 * The Notification Registration file v1 (`plugin/README.md`): the whole `notifications.json` a
 * Host holds. Entries this device did not write are carried verbatim, so a newer app's additive
 * metadata survives a rewrite from this one. A Host only ever reads, replaces or removes its
 * own entry, and the app keeps at most one entry per (device token, session). Immutable.
 */
export class NotificationRegistrationFile {
  static readonly version = 1;

  /** Every device entry in file order, foreign entries verbatim. */
  readonly devices: JsonValue[];

  constructor(devices: JsonValue[] = []) {
    this.devices = devices;
  }

  /**
   * Decodes the file a Host holds. Absent or corrupt content decodes as empty (the plugin reader
   * sends nothing for both and the next registration self-heals). A parseable file declaring
   * another version is refused instead of clobbered.
   */
  static decode(data: Uint8Array | null): NotificationRegistrationFile {
    const parsed = parseFile(data);
    if (parsed === null) return new NotificationRegistrationFile();
    if (parsed.v !== NotificationRegistrationFile.version) {
      throw new NotificationRegistrationError({
        kind: 'unsupportedFileVersion',
        version: parsed.v,
      });
    }
    return new NotificationRegistrationFile(parsed.devices);
  }

  equals(other: NotificationRegistrationFile): boolean {
    return jsonEqual(this.devices, other.devices);
  }

  /** The serialized file for an atomic whole-file replace. */
  encoded(): Uint8Array {
    return utf8Encode(
      encodeSortedJson({ v: NotificationRegistrationFile.version, devices: this.devices }),
    );
  }

  /**
   * Writes the Host's own entry for the entry's session: merges over the existing own entry (so
   * `live_activity` and fields this type does not own survive) or appends one. Any other entry of
   * this device token in the same session is dropped (last writer wins), as are duplicate own
   * entries.
   */
  registering(entry: NotificationDeviceEntry): NotificationRegistrationFile {
    const owner = entryOwner(entry);
    const updated = [...this.devices];
    let own = this.ownIndex(owner);
    if (own >= 0) {
      updated[own] = mergeFields(updated[own] ?? null, entryWire(entry));
    } else {
      updated.push(entryWire(entry));
      own = updated.length - 1;
    }
    const kept = updated.filter((device, index) => {
      if (index === own || stringField(device, 'token') !== owner.deviceToken) return true;
      return !owns(owner, device) && stringField(device, 'session') !== entry.session;
    });
    return new NotificationRegistrationFile(kept);
  }

  /** Drops every entry of this Host; other Hosts' entries of the same device stay. */
  removing(owner: NotificationRegistrationOwner): NotificationRegistrationFile {
    return new NotificationRegistrationFile(this.devices.filter((d) => !owns(owner, d)));
  }

  /**
   * Drops every entry carrying this Notification Key, whatever its device token: the key never
   * leaves this device, so each such entry is this device's own, an older token's included.
   */
  removingKey(key: Uint8Array): NotificationRegistrationFile {
    const encoded = encodeBase64Url(key);
    return new NotificationRegistrationFile(
      this.devices.filter((device) => stringField(device, 'key') !== encoded),
    );
  }

  /**
   * Moves the Host's own entry to the session the Host targets now, keeping unknown fields,
   * unless another Host already holds this device's slot in that session: then the stale own
   * entry is dropped and the Host reads as unregistered. Duplicate own entries collapse to one.
   * An unknown session or a missing own entry changes nothing.
   */
  normalized(owner: NotificationRegistrationOwner): NotificationRegistrationFile {
    const session = owner.session;
    const own = this.ownIndex(owner);
    if (session === null || own < 0) return this;
    const updated = this.devices.filter((d, index) => index === own || !owns(owner, d));
    const index = updated.findIndex((d) => owns(owner, d));
    const entry = updated[index];
    if (entry === undefined || stringField(entry, 'session') === session) {
      return new NotificationRegistrationFile(updated);
    }
    const slotTaken = updated.some(
      (other, i) =>
        i !== index &&
        stringField(other, 'token') === owner.deviceToken &&
        stringField(other, 'session') === session,
    );
    if (slotTaken) updated.splice(index, 1);
    else updated[index] = mergeFields(entry, { session });
    return new NotificationRegistrationFile(updated);
  }

  /**
   * The notify flags of the Host's own entry, null when the Host is not registered. A missing or
   * mistyped flag reads as off, as the plugin's notify hook reads it.
   */
  preferences(owner: NotificationRegistrationOwner): NotificationTriggerPreferences | null {
    const own = this.devices[this.ownIndex(owner)];
    if (own === undefined) return null;
    const notify = (own as JsonObject).notify;
    return {
      blocked: isTrueField(notify, 'blocked'),
      done: isTrueField(notify, 'done'),
      approve: isTrueField(notify, 'approve'),
    };
  }

  /**
   * The Host's own entry: the one carrying this token and the Host's key, preferring the one
   * already in the Host's session when duplicates exist. -1 when there is none.
   */
  private ownIndex(owner: NotificationRegistrationOwner): number {
    const candidates = this.devices.flatMap((d, i) => (owns(owner, d) ? [i] : []));
    if (owner.session !== null) {
      const current = candidates.find(
        (i) => stringField(this.devices[i], 'session') === owner.session,
      );
      if (current !== undefined) return current;
    }
    return candidates[0] ?? -1;
  }
}

function parseFile(data: Uint8Array | null): { v: number; devices: JsonValue[] } | null {
  if (data === null) return null;
  const text = utf8Decode(data, true);
  if (text === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { v, devices } = value as Record<string, unknown>;
  if (typeof v !== 'number' || !Number.isInteger(v)) return null;
  if (devices !== undefined && devices !== null && !Array.isArray(devices)) return null;
  return { v, devices: (devices ?? []) as JsonValue[] };
}
