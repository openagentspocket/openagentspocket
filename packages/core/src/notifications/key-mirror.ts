import { encodeBase64Url } from '../pairing/bytes';
import type { NotificationKeyRecord, NotificationKeyStore } from './key-store';

/** The App Group file the widget reads Notification Keys from (the Keychain is locked with the device). */
export const KEY_MIRROR_FILE_NAME = 'notification-keys.json';

/** The mirror's text: versioned, records sorted by Host so equal key sets give equal text. */
export function keyMirrorText(records: readonly NotificationKeyRecord[]): string {
  const sorted = [...records].sort((a, b) =>
    a.hostId < b.hostId ? -1 : a.hostId > b.hostId ? 1 : 0,
  );
  return JSON.stringify({
    v: 1,
    records: sorted.map((record) => ({
      host: record.hostId,
      name: record.hostName,
      key: encodeBase64Url(record.key),
    })),
  });
}

/** Writes the mirror file; false when the container is unavailable. */
export type KeyMirrorSink = (name: string, text: string) => Promise<boolean>;

/**
 * Wraps the real key store and rewrites the mirror file whenever the key records change. A failed
 * mirror write never fails the key change (the Keychain stays the truth); `sync()` retries it.
 */
export class MirroredNotificationKeyStore implements NotificationKeyStore {
  private lastWritten: string | null = null;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly inner: NotificationKeyStore,
    private readonly sink: KeyMirrorSink,
  ) {}

  record(hostId: string): NotificationKeyRecord | null {
    return this.inner.record(hostId);
  }

  save(record: NotificationKeyRecord): void {
    this.inner.save(record);
    void this.sync();
  }

  removeRecord(hostId: string): void {
    this.inner.removeRecord(hostId);
    void this.sync();
  }

  allRecords(): NotificationKeyRecord[] {
    return this.inner.allRecords();
  }

  /** Rewrites the mirror when the records differ from what was last written. */
  sync(): Promise<void> {
    const text = keyMirrorText(this.inner.allRecords());
    this.chain = this.chain.then(async () => {
      if (text === this.lastWritten) return;
      try {
        if (await this.sink(KEY_MIRROR_FILE_NAME, text)) this.lastWritten = text;
      } catch {
        // Retried by the next change or sync().
      }
    });
    return this.chain;
  }
}
