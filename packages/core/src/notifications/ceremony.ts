import { sessionFromSocketPath } from '../hosts/herdr-endpoint';
import { type Host, hostDisplayName } from '../hosts/host';
import { trimSpaces } from '../hosts/text';
import { NotificationConfigFile } from './config-file';
import { NotificationRegistrationError } from './errors';
import {
  generateNotificationKey,
  type NotificationKeyRecord,
  type NotificationKeyStore,
  type RandomBytes,
} from './key-store';
import type { PushDeviceToken } from './push-token';
import {
  type NotificationDeviceEntry,
  NotificationRegistrationFile,
  type NotificationRegistrationOwner,
  type NotificationTriggerPreferences,
  triggerPreferences,
} from './registration-file';
import { DEFAULT_RELAY_BASE_URL } from './relay-endpoint';
import type { NotificationTransport } from './transport';

/**
 * The herdr session value a registration entry carries for a Host: "" for the default session,
 * otherwise the session name. A paired endpoint carries the session its socket names, as its
 * hooks derive it.
 */
export function hostNotificationSession(host: Host): string {
  if (host.herdrEndpoint) return sessionFromSocketPath(host.herdrEndpoint.socketPath) ?? '';
  return trimSpaces(host.sessionName);
}

/** Serializes registration-file read-modify-writes so interleaved Hosts keep each other's entries. */
export class RegistrationGate {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

export interface RegisterOptions {
  readonly host: Host;
  readonly deviceToken: PushDeviceToken;
  readonly notify?: NotificationTriggerPreferences;
  /** The custom Push Relay base URL; null/absent writes the default relay. */
  readonly relayBaseURL?: string | null;
  readonly transport: NotificationTransport;
}

export interface LiveActivityTokenOptions {
  readonly host: Host;
  readonly deviceToken: PushDeviceToken;
  readonly tokenHex: string;
  /** ISO 8601 UTC. */
  readonly startedAt: string;
  readonly pinnedPaneIds: readonly string[];
  readonly hostName?: string;
  readonly transport: NotificationTransport;
}

/**
 * The per-Host Notification Registration ceremony: mint or reuse the Host's Notification Key,
 * then write this device's entry into the registration file the Host's notify hook reads. Every
 * failure is thrown: a thrown error means notifications are not armed, never silently broken.
 */
export class NotificationRegistrationCeremony {
  constructor(
    readonly keys: NotificationKeyStore,
    private readonly randomBytes: RandomBytes,
    private readonly gate: RegistrationGate = new RegistrationGate(),
  ) {}

  /** Who this device's entry belongs to on `host`; null when no key is stored for it. */
  registrationOwner(
    host: Host,
    deviceToken: PushDeviceToken,
  ): NotificationRegistrationOwner | null {
    const record = this.keys.record(host.id);
    if (!record) return null;
    return {
      deviceToken: deviceToken.token,
      key: record.key,
      session: hostNotificationSession(host),
    };
  }

  /**
   * Registers this device on one Host. The key is saved locally before the remote write: a write
   * that fails after that leaves a key the retry reuses, whereas the reverse order could put a
   * key on the Host this device cannot decrypt with. Idempotent per herdr session.
   */
  async register(options: RegisterOptions): Promise<NotificationKeyRecord> {
    const { host, deviceToken, transport } = options;
    const record = this.hostRecord(host);
    this.keys.save(record);
    const entry: NotificationDeviceEntry = {
      token: deviceToken,
      key: record.key,
      session: hostNotificationSession(host),
      notify: options.notify ?? triggerPreferences(),
    };
    await this.gate.run(async () => {
      const file = NotificationRegistrationFile.decode(await transport.readRegistration());
      await transport.replaceRegistration(file.registering(entry).encoded());
    });
    await applyRelayURL(options.relayBaseURL ?? null, transport);
    return record;
  }

  /**
   * Revokes this device on one Host: its entries leave the file, then the local key is dropped,
   * in that order, so a failed remote removal keeps the key still-armed pushes need.
   */
  async remove(host: Host, deviceToken: PushDeviceToken, transport: NotificationTransport) {
    const owner = this.registrationOwner(host, deviceToken);
    await this.dropEntries(transport, (file) => (owner ? file.removing(owner) : file));
    this.keys.removeRecord(host.id);
  }

  /**
   * Revokes this device on a Host about to be removed: drops every entry carrying the Host's key
   * and keeps the local record. Needs no device token. Without a stored key nothing is read.
   */
  async revoke(host: Host, transport: NotificationTransport): Promise<void> {
    const key = this.keys.record(host.id)?.key;
    if (!key) return;
    await this.dropEntries(transport, (file) => file.removingKey(key));
  }

  /**
   * Writes the normalized file when the Host's own entry predates its current session, and
   * returns the file the Host holds afterwards. Re-reads under the gate; idempotent.
   */
  migrate(
    host: Host,
    deviceToken: PushDeviceToken,
    transport: NotificationTransport,
  ): Promise<NotificationRegistrationFile> {
    const owner = this.registrationOwner(host, deviceToken);
    return this.gate.run(async () => {
      const file = NotificationRegistrationFile.decode(await transport.readRegistration());
      if (!owner) return file;
      const normalized = file.normalized(owner);
      if (!normalized.equals(file)) await transport.replaceRegistration(normalized.encoded());
      return normalized;
    });
  }

  /**
   * Writes this device's Live Activity push token into the Host's own entry, first dropping that
   * token from every other entry. The Host must already be registered (`deviceNotRegistered`).
   */
  setLiveActivityToken(options: LiveActivityTokenOptions): Promise<void> {
    const { host, deviceToken, transport } = options;
    const owner = this.registrationOwner(host, deviceToken);
    return this.rewrite(owner, transport, (file) => {
      if (!owner) throw new NotificationRegistrationError({ kind: 'deviceNotRegistered' });
      return file.settingLiveActivity(
        {
          token: options.tokenHex,
          startedAt: options.startedAt,
          pinnedPaneIds: options.pinnedPaneIds,
          hostName: options.hostName,
        },
        owner,
      );
    });
  }

  /** Updates the pin list on the Host's own `live_activity`; a no-op while that field is absent. */
  async setLiveActivityPinnedPaneIds(
    host: Host,
    deviceToken: PushDeviceToken,
    pinnedPaneIds: readonly string[],
    transport: NotificationTransport,
  ): Promise<void> {
    const owner = this.registrationOwner(host, deviceToken);
    if (!owner) return;
    await this.rewrite(owner, transport, (file) =>
      file.settingLiveActivityPinnedPaneIds(pinnedPaneIds, owner),
    );
  }

  /**
   * Drops `live_activity` from the Host's own entry. `liveToken` is the token last written, when
   * known: it limits the own-entry clear to that token and finds a stale copy without an entry.
   */
  clearLiveActivityToken(
    host: Host,
    deviceToken: PushDeviceToken,
    liveToken: string | null,
    transport: NotificationTransport,
  ): Promise<void> {
    const owner = this.registrationOwner(host, deviceToken);
    return this.rewrite(owner, transport, (file) => file.clearingLiveActivity(liveToken, owner));
  }

  /** One read-modify-write: normalize toward the Host's session, apply `change`, write if different. */
  private rewrite(
    owner: NotificationRegistrationOwner | null,
    transport: NotificationTransport,
    change: (file: NotificationRegistrationFile) => NotificationRegistrationFile,
  ): Promise<void> {
    return this.gate.run(async () => {
      const read = NotificationRegistrationFile.decode(await transport.readRegistration());
      const base = owner ? read.normalized(owner) : read;
      let result = base;
      let failure: unknown;
      try {
        result = change(base);
      } catch (thrown) {
        failure = thrown;
      }
      if (!result.equals(read)) await transport.replaceRegistration(result.encoded());
      if (failure !== undefined) throw failure;
    });
  }

  /** Reads the Host's current registration file (under the gate, so a write in flight lands first). */
  read(transport: NotificationTransport): Promise<NotificationRegistrationFile> {
    return this.gate.run(async () =>
      NotificationRegistrationFile.decode(await transport.readRegistration()),
    );
  }

  private dropEntries(
    transport: NotificationTransport,
    drop: (file: NotificationRegistrationFile) => NotificationRegistrationFile,
  ): Promise<void> {
    return this.gate.run(async () => {
      const data = await transport.readRegistration();
      if (data === null) return;
      const file = NotificationRegistrationFile.decode(data);
      const updated = drop(file);
      if (!updated.equals(file)) await transport.replaceRegistration(updated.encoded());
    });
  }

  /** The existing key when one is stored (the Host keeps decrypting with it), else a fresh one. */
  private hostRecord(host: Host): NotificationKeyRecord {
    const key = this.keys.record(host.id)?.key ?? generateNotificationKey(this.randomBytes);
    return { hostId: host.id, hostName: hostDisplayName(host), key };
  }
}

/**
 * Writes the relay base URL into the Host's `notify.json` so its notify hook POSTs there.
 * Read-merge-write keeps the plugin's own knobs; an unchanged config is not rewritten.
 */
async function applyRelayURL(
  relayBaseURL: string | null,
  transport: NotificationTransport,
): Promise<void> {
  const url = relayBaseURL ?? DEFAULT_RELAY_BASE_URL;
  const config = NotificationConfigFile.decode(await transport.readConfig());
  const updated = config.settingRelayURL(url);
  if (updated.equals(config)) return;
  await transport.replaceConfig(updated.encoded());
}
