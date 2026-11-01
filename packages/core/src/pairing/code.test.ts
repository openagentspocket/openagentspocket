import { describe, expect, it } from 'vitest';
import v1 from '../../../plugin/test-vectors/pairing-code-v1.json';
import v2 from '../../../plugin/test-vectors/pairing-code-v2.json';
import { decodeBase64Url, encodeBase64Url, utf8Decode, utf8Encode } from './bytes';
import { decodePairingCode, needsConfirmation, type PairingCode } from './code';
import { canonicalFingerprint, sameFingerprint } from './fingerprint';

interface VectorPayload {
  addresses: string[];
  port: number;
  username: string;
  hostKeyFingerprint: string;
  bootstrapSeed?: string;
  expiresAt?: number;
  socketPath?: string;
  herdrPath?: string;
}
interface ValidVector {
  name: string;
  code: string;
  payload: VectorPayload;
}

function decoded(scanned: string): PairingCode {
  const result = decodePairingCode(scanned);
  if (!result.ok) throw new Error(`did not decode: ${result.error.code}`);
  return result.code;
}

function errorOf(scanned: string) {
  const result = decodePairingCode(scanned);
  return result.ok ? null : result.error;
}

function expectDecoded(code: PairingCode, payload: VectorPayload) {
  expect(code.addresses).toEqual(payload.addresses);
  expect(code.port).toBe(payload.port);
  expect(code.username).toBe(payload.username);
  expect(code.hostKeyFingerprint).toBe(payload.hostKeyFingerprint);
  if (payload.bootstrapSeed === undefined) {
    expect(code.bootstrap).toBeNull();
  } else {
    expect(code.bootstrap && encodeBase64Url(code.bootstrap.seed)).toBe(payload.bootstrapSeed);
    expect(code.bootstrap?.expiresAt).toBe(payload.expiresAt);
  }
  if (payload.socketPath === undefined) {
    expect(payload.herdrPath).toBeUndefined();
    expect(code.endpoint).toBeNull();
  } else {
    expect(code.endpoint).toEqual({
      socketPath: payload.socketPath,
      executablePath: payload.herdrPath,
    });
  }
}

describe('Pairing Code vectors', () => {
  it('loads non-empty vector files', () => {
    expect(v1.valid.length).toBeGreaterThanOrEqual(3);
    expect(v1.invalid.length).toBeGreaterThanOrEqual(10);
    expect(v2.valid.length).toBeGreaterThanOrEqual(5);
    expect(v2.invalid.length).toBeGreaterThanOrEqual(13);
  });

  it.each(v1.valid.map((v) => [v.name, v] as const))('v1 decodes: %s', (_, vector) => {
    const code = decoded(vector.code);
    expectDecoded(code, vector.payload);
    expect(code.endpoint).toBeNull();
  });

  it.each(v1.invalid.map((v) => [v.name, v] as const))('v1 rejects: %s', (_, vector) => {
    expect(errorOf(vector.code)?.code).toBe(vector.error);
  });

  it.each((v2.valid as ValidVector[]).map((v) => [v.name, v] as const))(
    'v2 decodes: %s',
    (_, vector) => {
      expectDecoded(decoded(vector.code), vector.payload);
    },
  );

  it.each(v2.invalid.map((v) => [v.name, v] as const))('v2 rejects: %s', (_, vector) => {
    expect(errorOf(vector.code)?.code).toBe(vector.error);
  });
});

describe('decodePairingCode', () => {
  it('checks the v1 fields first under version 2, with the same reasons', () => {
    const portZero = v1.invalid.find((v) => v.name === 'port zero');
    expect(portZero).toBeDefined();
    const v1Code = portZero?.code ?? '';
    const v2Code = v1Code.replace('HERDR-PAIR:1:', 'HERDR-PAIR:2:');
    expect(v2Code).not.toBe(v1Code);
    expect(errorOf(v2Code)).toEqual(errorOf(v1Code));
  });

  it('names the version it does not understand', () => {
    expect(errorOf('HERDR-PAIR:3:e30')).toEqual({ code: 'unsupported_version', found: '3' });
    expect(errorOf('HERDR-PAIR:01:e30')?.code).toBe('unsupported_version');
  });

  it('checks the version before reading the body', () => {
    // A future version may frame its body differently; it still names the version.
    expect(errorOf('HERDR-PAIR:3:!!!')).toEqual({ code: 'unsupported_version', found: '3' });
    expect(errorOf(`HERDR-PAIR:3:${encodeBase64Url(utf8Encode('[1]'))}`)).toEqual({
      code: 'unsupported_version',
      found: '3',
    });
    expect(errorOf('HERDR-PAIR:2:!!!')?.code).toBe('bad_encoding');
  });

  it('needs a version separator after the prefix', () => {
    expect(errorOf('HERDR-PAIR:1')?.code).toBe('bad_prefix');
  });

  it('rejects a body that is not an object as a bad payload', () => {
    expect(errorOf(`HERDR-PAIR:1:${encodeBase64Url(utf8Encode('[1]'))}`)?.code).toBe('bad_payload');
    expect(errorOf(`HERDR-PAIR:1:${encodeBase64Url(Uint8Array.of(0xff, 0xfe))}`)?.code).toBe(
      'bad_encoding',
    );
  });

  it('waits for a Pair tap only on an endpoint code without a Bootstrap Key', () => {
    let waiting = 0;
    for (const vector of [...v1.valid, ...v2.valid] as ValidVector[]) {
      const expected =
        vector.payload.socketPath !== undefined && vector.payload.bootstrapSeed === undefined;
      expect(needsConfirmation(decoded(vector.code)), vector.name).toBe(expected);
      if (expected) waiting += 1;
    }
    expect(waiting).toBeGreaterThan(0);
  });
});

describe('fingerprints and bytes', () => {
  const pinned = 'SHA256:6+jncNdibsG2cqvfoLApGrO8CvIwAEMzsB+IilOs8tg';

  it('compares fingerprints by digest', () => {
    expect(canonicalFingerprint(pinned)).toBe(pinned);
    // Same digest, non-zero unused trailing bits.
    expect(sameFingerprint(pinned, `${pinned.slice(0, -1)}h`)).toBe(true);
    expect(sameFingerprint(pinned, 'SHA256:short')).toBe(false);
    expect(canonicalFingerprint('MD5:aa:bb')).toBeNull();
  });

  it('round-trips base64url and UTF-8', () => {
    const bytes = Uint8Array.from({ length: 33 }, (_, i) => (i * 37) & 0xff);
    expect(decodeBase64Url(encodeBase64Url(bytes))).toEqual(bytes);
    expect(decodeBase64Url('a')).toBeNull();
    expect(decodeBase64Url('ab=c')).toBeNull();
    expect(utf8Decode(utf8Encode('héllo 🐑'))).toBe('héllo 🐑');
    expect(utf8Decode(Uint8Array.of(0xc0, 0x80), true)).toBeNull();
    expect(utf8Decode(Uint8Array.of(0x61, 0xff))).toBe('a�');
  });
});
