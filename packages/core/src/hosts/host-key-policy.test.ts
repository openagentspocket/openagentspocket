import { describe, expect, it } from 'vitest';
import { fingerprintFromBlob, fingerprintFromDigest, type HostKeyFingerprint } from './fingerprint';
import {
  type HostKeyCandidate,
  type HostKeyPolicy,
  type HostKeyTrust,
  hostTrustKey,
  verifyHostKey,
} from './host-key-policy';
import { KnownHostsStore } from './known-hosts';

const bytes = (text: string) => new TextEncoder().encode(text);

function hostKey(algorithm: string, marker: string): HostKeyFingerprint {
  const name = bytes(algorithm);
  const blob = new Uint8Array(4 + name.length + marker.length);
  new DataView(blob.buffer).setUint32(0, name.length);
  blob.set(name, 4);
  blob.set(bytes(marker), 4 + name.length);
  return fingerprintFromBlob(blob);
}

function policy(knownHosts: KnownHostsStore, answer: boolean) {
  const asked: HostKeyCandidate[] = [];
  const value: HostKeyPolicy = {
    knownHosts,
    confirmFirstConnect: async (candidate) => {
      asked.push(candidate);
      return answer;
    },
  };
  return { policy: value, asked };
}

const verify = (
  presented: HostKeyFingerprint,
  p: HostKeyPolicy,
  host = 'host.example',
  port = 22,
  trust?: HostKeyTrust,
) => verifyHostKey({ host, port, policy: p, presented, ...(trust ? { trust } : {}) });

describe('host key policy (TOFU)', () => {
  it('asks on first connect and persists an algorithm-aware fingerprint when accepted', async () => {
    const knownHosts = new KnownHostsStore();
    const presented = hostKey('ssh-ed25519', 'host-a');
    const { policy: p, asked } = policy(knownHosts, true);

    expect(await verify(presented, p)).toBeNull();

    expect(asked.map((c) => c.fingerprint)).toEqual([presented]);
    expect(knownHosts.fingerprintFor('host.example', 22, 'ssh-ed25519')).toEqual(presented);
  });

  it('persists nothing when the user rejects the key', async () => {
    const knownHosts = new KnownHostsStore();
    const presented = hostKey('ssh-ed25519', 'host-a');

    expect(await verify(presented, policy(knownHosts, false).policy)).toEqual({
      kind: 'hostKeyRejected',
      presented,
    });
    expect(knownHosts.fingerprints('host.example', 22)).toEqual([]);
  });

  it('connects a known algorithm and key without asking', async () => {
    const knownHosts = new KnownHostsStore();
    const presented = hostKey('ssh-ed25519', 'host-a');
    knownHosts.setFingerprint(presented, 'host.example', 22);
    const { policy: p, asked } = policy(knownHosts, false);

    expect(await verify(presented, p)).toBeNull();
    expect(asked).toEqual([]);
  });

  it('fails a changed key without asking or overwriting', async () => {
    const knownHosts = new KnownHostsStore();
    const trusted = hostKey('ssh-ed25519', 'trusted');
    const changed = hostKey('ssh-ed25519', 'changed');
    knownHosts.setFingerprint(trusted, 'host.example', 22);
    const { policy: p, asked } = policy(knownHosts, true);

    expect(await verify(changed, p)).toEqual({
      kind: 'hostKeyMismatch',
      known: trusted,
      presented: changed,
    });
    expect(asked).toEqual([]);
    expect(knownHosts.fingerprintFor('host.example', 22, 'ssh-ed25519')).toEqual(trusted);
  });

  it('migrates a matching digest stored without its algorithm', async () => {
    const knownHosts = new KnownHostsStore();
    const presented = hostKey('ssh-ed25519', 'host-a');
    knownHosts.setFingerprint(fingerprintFromDigest(presented.digest), 'host.example', 22);

    expect(await verify(presented, policy(knownHosts, false).policy)).toBeNull();

    expect(knownHosts.fingerprintFor('host.example', 22, 'ssh-ed25519')).toEqual(presented);
    expect(knownHosts.fingerprintFor('host.example', 22, '*')).toBeNull();
  });

  it('treats a trusted machine presenting another algorithm as a mismatch, not a first connect', async () => {
    const knownHosts = new KnownHostsStore();
    const trusted = hostKey('ssh-ed25519', 'trusted');
    const replacement = hostKey('ecdsa-sha2-nistp256', 'replacement');
    knownHosts.setFingerprint(trusted, 'host.example', 22);
    const { policy: p, asked } = policy(knownHosts, true);

    expect(await verify(replacement, p)).toEqual({
      kind: 'hostKeyMismatch',
      known: trusted,
      presented: replacement,
    });
    expect(asked).toEqual([]);
    expect(knownHosts.fingerprints('host.example', 22)).toEqual([trusted]);
  });
});

describe('host-scoped trust', () => {
  const hostId = 'A1B2C3D4-0000-4000-8000-000000000001';
  const trust: HostKeyTrust = { kind: 'host', hostId };
  const stored = hostTrustKey(hostId);

  it('stores under a lowercased id on port 0, which no endpoint uses', () => {
    expect(stored).toEqual({ host: `agentico-host:${hostId.toLowerCase()}`, port: 0 });
  });

  it('shares the trust the first route confirmed with every route', async () => {
    const knownHosts = new KnownHostsStore();
    const { policy: p, asked } = policy(knownHosts, true);
    const key = hostKey('ssh-ed25519', 'box');

    expect(await verify(key, p, '192.168.1.5', 22, trust)).toBeNull();
    expect(await verify(key, p, '100.64.0.5', 22, trust)).toBeNull();

    // The prompt names the endpoint dialled; the trust is the Host's.
    expect(asked.map((c) => `${c.host}:${c.port}`)).toEqual(['192.168.1.5:22']);
    expect(knownHosts.fingerprint(stored.host, stored.port)).toEqual(key);
    expect(knownHosts.fingerprints('192.168.1.5', 22)).toEqual([]);
  });

  it('refuses another machine on a route before authentication', async () => {
    const knownHosts = new KnownHostsStore();
    const trusted = hostKey('ssh-ed25519', 'box');
    knownHosts.setFingerprint(trusted, stored.host, stored.port);
    const other = hostKey('ssh-ed25519', 'cafe-printer');

    expect(await verify(other, policy(knownHosts, true).policy, '192.168.1.5', 22, trust)).toEqual({
      kind: 'hostKeyMismatch',
      known: trusted,
      presented: other,
    });
  });

  it('adopts trust saved by endpoint without a prompt', async () => {
    const knownHosts = new KnownHostsStore();
    const key = hostKey('ssh-ed25519', 'box');
    knownHosts.setFingerprint(key, 'box.example', 2222);
    const { policy: p, asked } = policy(knownHosts, false);

    expect(await verify(key, p, 'box.example', 2222, trust)).toBeNull();

    expect(asked).toEqual([]);
    expect(knownHosts.fingerprint(stored.host, stored.port)).toEqual(key);
  });

  it('does not adopt endpoint trust once the Host has its own', async () => {
    const knownHosts = new KnownHostsStore();
    const trusted = hostKey('ssh-ed25519', 'box');
    knownHosts.setFingerprint(trusted, stored.host, stored.port);
    const other = hostKey('ssh-ed25519', 'other');
    knownHosts.setFingerprint(other, '127.0.0.1', 2222);

    const failure = await verify(other, policy(knownHosts, true).policy, '127.0.0.1', 2222, trust);

    expect(failure?.kind).toBe('hostKeyMismatch');
    expect(knownHosts.fingerprint(stored.host, stored.port)).toEqual(trusted);
  });
});
