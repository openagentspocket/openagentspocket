import {
  decodeBase64Url,
  encodeBase64Url,
  NOTIFICATION_KEY_BYTES,
  type NotificationKeyRecord,
  type NotificationKeyStore,
  validateKeyRecord,
} from '@openagentspocket/core';
import type { SharedKeychain } from 'agentico-app-group';

/** The Keychain item payload the Swift extension decodes (`StoredRecord`): versioned, key as base64url. */
interface StoredRecord {
  v: 1;
  name: string;
  key: string;
}

function parse(hostId: string, text: string): NotificationKeyRecord | null {
  try {
    const stored: unknown = JSON.parse(text);
    if (typeof stored !== 'object' || stored === null) return null;
    const { v, name, key } = stored as Partial<StoredRecord>;
    if (v !== 1 || typeof name !== 'string' || name === '' || typeof key !== 'string') return null;
    const bytes = decodeBase64Url(key);
    if (bytes === null || bytes.length !== NOTIFICATION_KEY_BYTES) return null;
    return { hostId, hostName: name, key: bytes };
  } catch {
    return null;
  }
}

/**
 * Notification Keys in the Keychain access group shared with the iOS Notification Service
 * Extension, which selects a key by an envelope's kid while the app is not running. Records that
 * no longer parse are skipped: one corrupt entry must not take down the other Hosts.
 */
export class KeychainNotificationKeyStore implements NotificationKeyStore {
  constructor(private readonly keychain: SharedKeychain) {}

  record(hostId: string): NotificationKeyRecord | null {
    const text = this.keychain.read(hostId);
    return text === null ? null : parse(hostId, text);
  }

  save(record: NotificationKeyRecord): void {
    validateKeyRecord(record);
    const stored: StoredRecord = { v: 1, name: record.hostName, key: encodeBase64Url(record.key) };
    if (!this.keychain.save(record.hostId, JSON.stringify(stored))) {
      throw new Error('The Keychain refused the Notification Key.');
    }
  }

  removeRecord(hostId: string): void {
    this.keychain.remove(hostId);
  }

  allRecords(): NotificationKeyRecord[] {
    return Object.entries(this.keychain.readAll()).flatMap(([hostId, text]) => {
      const record = parse(hostId, text);
      return record === null ? [] : [record];
    });
  }
}
