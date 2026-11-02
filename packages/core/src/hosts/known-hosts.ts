import {
  fingerprintFromDigest,
  type HostKeyFingerprint,
  UNKNOWN_HOST_KEY_ALGORITHM,
} from './fingerprint';
import { decodeBase64, encodeBase64, utf8Length } from './text';

/** A synchronous string key-value store (MMKV in the app, memory in tests). */
export interface KeyValueStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
}

/** Volatile storage for tests and previews. */
export class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();

  getString(key: string): string | undefined {
    return this.values.get(key);
  }

  set(key: string, value: string): void {
    this.values.set(key, value);
  }
}

export function endpointKey(host: string, port: number): string {
  return `${host}:${port}`;
}

/** Length-prefixed so no host:port can collide with another's algorithm keys. */
export function algorithmKeyPrefix(host: string, port: number): string {
  const endpoint = endpointKey(host, port);
  return `v2|${utf8Length(endpoint)}|${endpoint}|`;
}

export function algorithmKey(host: string, port: number, algorithm: string): string {
  return algorithmKeyPrefix(host, port) + algorithm;
}

export const KNOWN_HOSTS_STORAGE_KEY = 'knownHostFingerprints';

/**
 * TOFU persistence: fingerprints keyed by endpoint and SSH key algorithm, so
 * one machine can be trusted for more than one host-key algorithm, as with
 * OpenSSH. Not a secret: it guards against impostors, it does not
 * authenticate us. Synchronous, so concurrent first connects cannot lose each
 * other's read-modify-write updates.
 */
export class KnownHostsStore {
  constructor(
    private readonly storage: KeyValueStorage = new MemoryStorage(),
    private readonly storageKey: string = KNOWN_HOSTS_STORAGE_KEY,
  ) {}

  /** Every fingerprint trusted at `host:port`, a legacy `*` one included. */
  fingerprints(host: string, port: number): HostKeyFingerprint[] {
    const prefix = algorithmKeyPrefix(host, port);
    return Object.entries(this.read()).flatMap(([key, base64]) => {
      const digest = key.startsWith(prefix) ? decodeBase64(base64) : null;
      return digest ? [fingerprintFromDigest(digest, key.slice(prefix.length))] : [];
    });
  }

  /** The first trusted fingerprint at `host:port`, of any algorithm. */
  fingerprint(host: string, port: number): HostKeyFingerprint | null {
    return this.fingerprints(host, port)[0] ?? null;
  }

  /** The fingerprint for `algorithm`, falling back to a legacy one without an algorithm. */
  fingerprintFor(host: string, port: number, algorithm: string): HostKeyFingerprint | null {
    const stored = this.read();
    for (const candidate of [algorithm, UNKNOWN_HOST_KEY_ALGORITHM]) {
      const base64 = stored[algorithmKey(host, port, candidate)];
      const digest = base64 === undefined ? null : decodeBase64(base64);
      if (digest) return fingerprintFromDigest(digest, candidate);
    }
    return null;
  }

  /** Trusts `fingerprint`; a known algorithm replaces any legacy entry. */
  setFingerprint(fingerprint: HostKeyFingerprint, host: string, port: number): void {
    const stored = this.read();
    if (fingerprint.algorithm !== UNKNOWN_HOST_KEY_ALGORITHM) {
      delete stored[algorithmKey(host, port, UNKNOWN_HOST_KEY_ALGORITHM)];
    }
    stored[algorithmKey(host, port, fingerprint.algorithm)] = encodeBase64(fingerprint.digest);
    this.write(stored);
  }

  /** Drops every fingerprint trusted at `host:port`, legacy entry included. */
  forgetFingerprints(host: string, port: number): void {
    const prefix = algorithmKeyPrefix(host, port);
    const stored = this.read();
    const kept = Object.fromEntries(
      Object.entries(stored).filter(([key]) => !key.startsWith(prefix)),
    );
    if (Object.keys(kept).length !== Object.keys(stored).length) this.write(kept);
  }

  private read(): Record<string, string> {
    const raw = this.storage.getString(this.storageKey);
    if (raw === undefined) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
      return Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, string] => {
          return typeof entry[1] === 'string';
        }),
      );
    } catch {
      return {};
    }
  }

  private write(values: Record<string, string>): void {
    this.storage.set(this.storageKey, JSON.stringify(values));
  }
}
