import { describe, expect, it } from 'vitest';
import { KEY_MIRROR_FILE_NAME, keyMirrorText, MirroredNotificationKeyStore } from './key-mirror';
import { MemoryNotificationKeyStore, type NotificationKeyRecord } from './key-store';

const record = (hostId: string, fill: number): NotificationKeyRecord => ({
  hostId,
  hostName: `Host ${hostId}`,
  key: new Uint8Array(32).fill(fill),
});

function setup(accept = true) {
  const writes: { name: string; text: string }[] = [];
  let ok = accept;
  const store = new MirroredNotificationKeyStore(
    new MemoryNotificationKeyStore(),
    async (name, text) => {
      writes.push({ name, text });
      return ok;
    },
  );
  return { store, writes, setOk: (value: boolean) => (ok = value) };
}

describe('key mirror', () => {
  it('writes a versioned file with base64url keys, sorted by Host', () => {
    const parsed = JSON.parse(keyMirrorText([record('b', 2), record('a', 1)]));
    expect(parsed.v).toBe(1);
    expect(parsed.records.map((r: { host: string }) => r.host)).toEqual(['a', 'b']);
    expect(parsed.records[0]).toEqual({
      host: 'a',
      name: 'Host a',
      key: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE',
    });
  });

  it('rewrites the file when a key is saved and when it is removed', async () => {
    const { store, writes } = setup();
    store.save(record('a', 1));
    await store.sync();
    store.removeRecord('a');
    await store.sync();
    expect(writes.map((w) => w.name)).toEqual([KEY_MIRROR_FILE_NAME, KEY_MIRROR_FILE_NAME]);
    expect(JSON.parse(writes[0]?.text ?? '').records).toHaveLength(1);
    expect(JSON.parse(writes[1]?.text ?? '').records).toHaveLength(0);
  });

  it('does not rewrite identical content, and retries after a failed write', async () => {
    const { store, writes, setOk } = setup(false);
    store.save(record('a', 1));
    await store.sync();
    expect(writes).toHaveLength(2);
    setOk(true);
    await store.sync();
    await store.sync();
    expect(writes).toHaveLength(3);
  });

  it('keeps the key change when the mirror write throws', async () => {
    const inner = new MemoryNotificationKeyStore();
    const store = new MirroredNotificationKeyStore(inner, async () => {
      throw new Error('no container');
    });
    store.save(record('a', 1));
    await store.sync();
    expect(store.record('a')?.hostName).toBe('Host a');
  });
});
