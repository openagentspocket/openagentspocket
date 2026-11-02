import { describe, expect, it } from 'vitest';
import {
  fingerprintDisplay,
  fingerprintFromBlob,
  fingerprintFromDigest,
  readKeyAlgorithm,
  sameFingerprint,
  UNKNOWN_HOST_KEY_ALGORITHM,
} from './fingerprint';
import { decodeBase64, encodeBase64, utf8Length } from './text';

// Throwaway public keys made for this test; `ssh-keygen -lf` printed the fingerprints.
const ED25519 = {
  blob: 'AAAAC3NzaC1lZDI1NTE5AAAAIMOk8TYAGmatqiKEMWvfjaOrRIu0VT7eCLTKWDsFUe96',
  fingerprint: 'SHA256:rUmrVw2AxBwk/jb59P970xLOtPkmae6d9Z/AX+/JB6Q',
};
const ECDSA = {
  blob: 'AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBJ2ILpzWHHruM8Qp4jtn5vrA1TJM6nfBLLuAyz+L7Cmg805EVdYN3PEq1XJ+6Ekef0PS7hbW/sBdlgJnuuKUPSY=',
  fingerprint: 'SHA256:luvOoWcHh6LrzFXyandj6ZQcCfeC45OV+IxjKi07kEc',
};

const bytes = (text: string) => new TextEncoder().encode(text);

/** An SSH string (4-byte big-endian length + bytes) followed by `rest`. */
function blob(algorithm: string, rest = 'key'): Uint8Array {
  const name = bytes(algorithm);
  const out = new Uint8Array(4 + name.length + rest.length);
  new DataView(out.buffer).setUint32(0, name.length);
  out.set(name, 4);
  out.set(bytes(rest), 4 + name.length);
  return out;
}

describe('host key fingerprint', () => {
  it.each([ED25519, ECDSA])('prints what OpenSSH prints for $fingerprint', (key) => {
    const decoded = decodeBase64(key.blob);
    expect(decoded).not.toBeNull();
    expect(fingerprintDisplay(fingerprintFromBlob(decoded as Uint8Array))).toBe(key.fingerprint);
  });

  it('reads the algorithm from the blob', () => {
    expect(fingerprintFromBlob(decodeBase64(ED25519.blob) as Uint8Array).algorithm).toBe(
      'ssh-ed25519',
    );
    expect(fingerprintFromBlob(decodeBase64(ECDSA.blob) as Uint8Array).algorithm).toBe(
      'ecdsa-sha2-nistp256',
    );
  });

  it.each([
    ['too short', new Uint8Array([0, 0, 1])],
    ['zero length', blob('')],
    ['length past the end', new Uint8Array([0, 0, 0, 9, 0x61])],
    ['longer than 256 bytes', blob('a'.repeat(257))],
    ['whitespace', blob('ssh ed25519')],
    ['non-ASCII', blob('ssh-é')],
  ])('marks an unreadable algorithm (%s) as unknown', (_name, keyBlob) => {
    expect(readKeyAlgorithm(keyBlob)).toBeNull();
    expect(fingerprintFromBlob(keyBlob).algorithm).toBe(UNKNOWN_HOST_KEY_ALGORITHM);
  });

  it('accepts a 256-byte algorithm', () => {
    expect(readKeyAlgorithm(blob('a'.repeat(256)))).toBe('a'.repeat(256));
  });

  it('drops base64 padding and keeps the 43-character digest', () => {
    const display = fingerprintDisplay(fingerprintFromBlob(bytes('blob-a')));
    expect(display).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
  });

  it('compares digests only, so a stored digest without algorithm still matches', () => {
    const presented = fingerprintFromBlob(blob('ssh-ed25519', 'a'));
    const legacy = fingerprintFromDigest(presented.digest);
    expect(legacy.algorithm).toBe(UNKNOWN_HOST_KEY_ALGORITHM);
    expect(sameFingerprint(presented, legacy)).toBe(true);
    expect(sameFingerprint(presented, fingerprintFromBlob(blob('ssh-ed25519', 'b')))).toBe(false);
  });
});

describe('text helpers', () => {
  it('round-trips base64 and refuses malformed input', () => {
    for (const length of [0, 1, 2, 3, 4, 31, 32]) {
      const data = Uint8Array.from({ length }, (_, i) => (i * 37) & 0xff);
      expect(decodeBase64(encodeBase64(data))).toEqual(data);
      expect(encodeBase64(data)).toBe(Buffer.from(data).toString('base64'));
    }
    for (const bad of ['abc', 'ab=c', 'a===', 'ab$c']) expect(decodeBase64(bad)).toBeNull();
  });

  it('counts UTF-8 bytes', () => {
    expect(utf8Length('a/é/€/😀')).toBe(1 + 1 + 2 + 1 + 3 + 1 + 4);
  });
});
