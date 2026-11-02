import { sha256 } from '@noble/hashes/sha256';

export const NOTIFICATION_KEY_BYTES = 32;

/** One Host's Notification Key: the AES-256-GCM key its plugin encrypts pushes with. */
export interface NotificationKeyRecord {
  readonly hostId: string;
  readonly hostName: string;
  readonly key: Uint8Array;
}

/**
 * Where Notification Keys live on this device. The app backs it with the platform keychain
 * (the push decrypt step on both platforms reads it); tests use `MemoryNotificationKeyStore`.
 */
export interface NotificationKeyStore {
  record(hostId: string): NotificationKeyRecord | null;
  /** Throws when the key is not 32 bytes or the Host name is blank. */
  save(record: NotificationKeyRecord): void;
  removeRecord(hostId: string): void;
  allRecords(): NotificationKeyRecord[];
}

/** Fills a buffer with cryptographically secure random bytes (injected: core has no crypto). */
export type RandomBytes = (length: number) => Uint8Array;

export function generateNotificationKey(randomBytes: RandomBytes): Uint8Array {
  return randomBytes(NOTIFICATION_KEY_BYTES);
}

/** The key id the envelope carries: the first 8 bytes of the key's SHA-256. */
export function notificationKeyId(key: Uint8Array): Uint8Array {
  return sha256(key).slice(0, 8);
}

export function validateKeyRecord(record: NotificationKeyRecord): void {
  if (record.key.length !== NOTIFICATION_KEY_BYTES) {
    throw new RangeError('A Notification Key is 32 bytes.');
  }
  if (record.hostName.trim() === '') throw new RangeError('A key record needs a Host name.');
}

export class MemoryNotificationKeyStore implements NotificationKeyStore {
  private readonly records = new Map<string, NotificationKeyRecord>();

  record(hostId: string): NotificationKeyRecord | null {
    return this.records.get(hostId) ?? null;
  }

  save(record: NotificationKeyRecord): void {
    validateKeyRecord(record);
    this.records.set(record.hostId, record);
  }

  removeRecord(hostId: string): void {
    this.records.delete(hostId);
  }

  allRecords(): NotificationKeyRecord[] {
    return [...this.records.values()];
  }
}
