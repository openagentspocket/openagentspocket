import { decodeBase64, encodeBase64 } from './bytes';

/**
 * OpenSSH presentation `SHA256:` + 43 chars of unpadded standard base64 (a
 * 32-byte digest), re-encoded canonically so equal digests compare equal as
 * strings. Null for anything else.
 */
export function canonicalFingerprint(text: string | null | undefined): string | null {
  if (!text || !/^SHA256:[A-Za-z0-9+/]{43}$/.test(text)) return null;
  const digest = decodeBase64(text.slice('SHA256:'.length));
  return digest === null ? null : `SHA256:${encodeBase64(digest)}`;
}

/** Digest equality of two OpenSSH SHA256 fingerprints; false when either is malformed. */
export function sameFingerprint(a: string, b: string): boolean {
  const left = canonicalFingerprint(a);
  return left !== null && left === canonicalFingerprint(b);
}
