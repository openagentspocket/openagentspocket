import { describe, expect, it } from 'vitest';
import { fingerprintFromBlob, fingerprintFromDigest, type HostKeyFingerprint } from './fingerprint';
import { algorithmKey, KnownHostsStore, MemoryStorage } from './known-hosts';

const bytes = (text: string) => new TextEncoder().encode(text);

function keyed(algorithm: string, marker: string): HostKeyFingerprint {
  const name = bytes(algorithm);
  const blob = new Uint8Array(4 + name.length + marker.length);
  new DataView(blob.buffer).setUint32(0, name.length);
  blob.set(name, 4);
  blob.set(bytes(marker), 4 + name.length);
  return fingerprintFromBlob(blob);
}

const fingerprint = fingerprintFromBlob(bytes('blob-a'));
const otherFingerprint = fingerprintFromBlob(bytes('blob-b'));
const ed25519 = keyed('ssh-ed25519', 'ed');
const ecdsa = keyed('ecdsa-sha2-nistp256', 'ec');

describe('known hosts store', () => {
  it('keys fingerprints by host and port', () => {
    const store = new KnownHostsStore();
    expect(store.fingerprint('a.example', 22)).toBeNull();

    store.setFingerprint(fingerprint, 'a.example', 22);
    store.setFingerprint(otherFingerprint, 'a.example', 2222);

    expect(store.fingerprint('a.example', 22)?.digest).toEqual(fingerprint.digest);
    expect(store.fingerprint('a.example', 2222)?.digest).toEqual(otherFingerprint.digest);
    expect(store.fingerprint('b.example', 22)).toBeNull();
  });

  it('persists across instances over the same storage', () => {
    const storage = new MemoryStorage();
    new KnownHostsStore(storage).setFingerprint(fingerprint, 'a.example', 22);

    const reloaded = new KnownHostsStore(storage);
    expect(reloaded.fingerprint('a.example', 22)?.digest).toEqual(fingerprint.digest);
    expect(reloaded.fingerprint('a.example', 2222)).toBeNull();
  });

  it('overwrites a changed fingerprint', () => {
    const store = new KnownHostsStore();
    store.setFingerprint(fingerprint, 'a.example', 22);
    store.setFingerprint(otherFingerprint, 'a.example', 22);
    expect(store.fingerprint('a.example', 22)?.digest).toEqual(otherFingerprint.digest);
  });

  it('retains one fingerprint per algorithm for an endpoint, across instances', () => {
    const storage = new MemoryStorage();
    const store = new KnownHostsStore(storage);
    store.setFingerprint(ed25519, 'a.example', 22);
    store.setFingerprint(ecdsa, 'a.example', 22);

    for (const reader of [store, new KnownHostsStore(storage)]) {
      expect(reader.fingerprintFor('a.example', 22, 'ssh-ed25519')).toEqual(ed25519);
      expect(reader.fingerprintFor('a.example', 22, 'ecdsa-sha2-nistp256')).toEqual(ecdsa);
    }
  });

  it('loses no write when many stores share one storage', () => {
    const storage = new MemoryStorage();
    const stores = [new KnownHostsStore(storage), new KnownHostsStore(storage)];
    for (let index = 0; index < 50; index++) {
      stores[index % 2]?.setFingerprint(
        keyed('ssh-ed25519', `host-${index}`),
        `host-${index}.example`,
        22,
      );
    }
    for (let index = 0; index < 50; index++) {
      expect(stores[0]?.fingerprintFor(`host-${index}.example`, 22, 'ssh-ed25519')).not.toBeNull();
    }
  });

  it('forgets only the endpoint it is asked to', () => {
    const store = new KnownHostsStore();
    store.setFingerprint(ed25519, 'a.example', 22);
    store.setFingerprint(ecdsa, 'a.example', 22);
    store.setFingerprint(ed25519, 'a.example', 2222);
    store.setFingerprint(ed25519, 'b.example', 22);

    store.forgetFingerprints('a.example', 22);

    expect(store.fingerprints('a.example', 22)).toEqual([]);
    expect(store.fingerprint('a.example', 2222)).toEqual(ed25519);
    expect(store.fingerprint('b.example', 22)).toEqual(ed25519);
  });

  it('falls back to a digest stored without an algorithm until a known one replaces it', () => {
    const store = new KnownHostsStore();
    const legacy = fingerprintFromDigest(ed25519.digest);
    store.setFingerprint(legacy, 'a.example', 22);

    expect(store.fingerprintFor('a.example', 22, 'ssh-ed25519')).toEqual(legacy);

    store.setFingerprint(ed25519, 'a.example', 22);
    expect(store.fingerprintFor('a.example', 22, '*')).toBeNull();
    expect(store.fingerprints('a.example', 22)).toEqual([ed25519]);
  });

  it('keeps endpoints whose text shares a prefix apart', () => {
    const store = new KnownHostsStore();
    store.setFingerprint(ed25519, 'a.example', 22);
    expect(store.fingerprints('a.example', 2)).toEqual([]);
    expect(algorithmKey('a.example', 22, 'ssh-ed25519')).toBe('v2|12|a.example:22|ssh-ed25519');
  });

  it('reads corrupt storage as empty', () => {
    for (const raw of ['not json', '[1,2]', 'null', '{"v2|12|a.example:22|ssh-ed25519":5}']) {
      const storage = new MemoryStorage();
      storage.set('knownHostFingerprints', raw);
      expect(new KnownHostsStore(storage).fingerprints('a.example', 22)).toEqual([]);
    }
  });
});
