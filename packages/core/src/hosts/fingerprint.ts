import { sha256 } from '@noble/hashes/sha2';
import { encodeBase64 } from './text';

/** Marker for a fingerprint stored without its key algorithm. */
export const UNKNOWN_HOST_KEY_ALGORITHM = '*';

/**
 * An OpenSSH-style host key fingerprint: SHA-256 over the SSH wire-format
 * public key blob. What the user confirms on first connect and what the
 * known-hosts store keeps for TOFU. Two fingerprints are the same key when
 * their digests match, whatever algorithm each carries.
 */
export interface HostKeyFingerprint {
  /** The 32-byte SHA-256 digest. */
  readonly digest: Uint8Array;
  /** The key algorithm, the first string in the blob, or `*` when unknown. */
  readonly algorithm: string;
}

/** ASCII whitespace by the Unicode White_Space property: TAB..CR and SPACE. */
function isAsciiWhitespace(byte: number): boolean {
  return (byte >= 0x09 && byte <= 0x0d) || byte === 0x20;
}

/**
 * The algorithm named by the blob's leading SSH string (4-byte big-endian
 * length, 1...256 bytes), when it is printable ASCII without whitespace.
 */
export function readKeyAlgorithm(blob: Uint8Array): string | null {
  if (blob.length < 4) return null;
  const [b0 = 0, b1 = 0, b2 = 0, b3 = 0] = blob;
  const length = b0 * 0x1000000 + b1 * 0x10000 + b2 * 0x100 + b3;
  if (length === 0 || length > 256 || blob.length < 4 + length) return null;
  let algorithm = '';
  for (const byte of blob.subarray(4, 4 + length)) {
    if (byte >= 0x80 || isAsciiWhitespace(byte)) return null;
    algorithm += String.fromCharCode(byte);
  }
  return algorithm;
}

export function fingerprintFromBlob(publicKeyBlob: Uint8Array): HostKeyFingerprint {
  return {
    digest: sha256(publicKeyBlob),
    algorithm: readKeyAlgorithm(publicKeyBlob) ?? UNKNOWN_HOST_KEY_ALGORITHM,
  };
}

/** Rebuilds a fingerprint from a stored digest. */
export function fingerprintFromDigest(
  digest: Uint8Array,
  algorithm: string = UNKNOWN_HOST_KEY_ALGORITHM,
): HostKeyFingerprint {
  return { digest, algorithm };
}

/** What OpenSSH prints: `SHA256:<base64 without padding>`. */
export function fingerprintDisplay(fingerprint: HostKeyFingerprint): string {
  return `SHA256:${encodeBase64(fingerprint.digest).replace(/=+$/, '')}`;
}

/** Same key: the digests match. The algorithm does not take part. */
export function sameFingerprint(a: HostKeyFingerprint, b: HostKeyFingerprint): boolean {
  if (a.digest.length !== b.digest.length) return false;
  return a.digest.every((byte, index) => byte === b.digest[index]);
}
