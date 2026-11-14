// Code signing for updates, as expo-updates verifies it: RSASSA-PKCS1-v1_5 with SHA-256 over the
// exact bytes of the manifest (or directive) part, sent as `expo-signature: sig="<base64>",
// keyid="<id>", alg="rsa-v1_5-sha256"`, checked against the certificate embedded in the app
// (expo-updates SDK 58, CodeSigningConfiguration.swift / .kt).
//
// The private key: read from the file the owner names, held only as a KeyObject in memory, never
// printed, copied, written or taken from the environment or the repository.
import { createPrivateKey, sign, verify, X509Certificate } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import {
  DEFAULT_KEY_ID,
  parseSfvDictionary,
  SIGNATURE_ALG,
  signatureHeader,
} from '../src/protocol.js';

// id-kp-codeSigning: expo's certificate generator sets it and the client requires it.
const CODE_SIGNING_EKU = '1.3.6.1.5.5.7.3.3';

const inside = (root, path) => {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

/**
 * Load the signing key from a file path. Refuses key material passed as the argument itself, a
 * path inside the repository, and anything that is not an RSA private key. Error messages name
 * the path, never the content.
 *
 * @param {string} path
 * @param {{repoRoot: string}} options
 */
export function loadPrivateKey(path, { repoRoot }) {
  if (typeof path !== 'string' || path === '') throw new Error('--key <path> is required');
  if (path.includes('-----BEGIN')) throw new Error('--key takes a file path, not key material');
  const absolute = resolve(path);
  let real;
  try {
    real = realpathSync(absolute);
  } catch {
    throw new Error(`no key file at ${absolute}`);
  }
  if (inside(realpathSync(repoRoot), real))
    throw new Error(
      'the key file is inside the repository; keep it outside (docs/guides/updates.md)',
    );
  if (!statSync(real).isFile()) throw new Error(`${absolute} is not a file`);
  const bytes = readFileSync(real);
  let key;
  try {
    key = createPrivateKey(bytes);
  } catch {
    throw new Error(
      `${absolute} is not a readable private key (encrypted keys must be decrypted first)`,
    );
  } finally {
    bytes.fill(0);
  }
  if (key.asymmetricKeyType !== 'rsa') throw new Error('the signing key must be RSA');
  return key;
}

/**
 * Load the code signing certificate and list what the client would reject in it.
 *
 * @returns {{certificate: X509Certificate, problems: string[]}}
 */
export function loadCertificate(path, now = new Date()) {
  let certificate;
  try {
    certificate = new X509Certificate(readFileSync(path));
  } catch {
    throw new Error(`no readable certificate at ${path}`);
  }
  const problems = [];
  if (certificate.publicKey.asymmetricKeyType !== 'rsa')
    problems.push('the certificate key is not RSA');
  if (!(certificate.keyUsage ?? []).includes(CODE_SIGNING_EKU))
    problems.push('the certificate lacks the code signing extended key usage');
  if (now < new Date(certificate.validFrom))
    problems.push(`the certificate is not valid before ${certificate.validFrom}`);
  if (now > new Date(certificate.validTo))
    problems.push(
      `the certificate expired on ${certificate.validTo}; binaries that embed it apply no new update`,
    );
  return { certificate, problems };
}

/** Sign bytes; returns the complete expo-signature value. */
export function signBytes(bytes, privateKey, keyId = DEFAULT_KEY_ID) {
  return signatureHeader(sign('sha256', bytes, privateKey).toString('base64'), keyId);
}

/**
 * Check an expo-signature value against bytes, as the client does. Stricter than the client on
 * `alg` (it only warns on a mismatch).
 *
 * @returns {string | null} the problem, or null when the signature is valid
 */
export function signatureProblem({ bytes, header, certificate, keyId = DEFAULT_KEY_ID }) {
  if (!header) return 'no expo-signature';
  const fields = parseSfvDictionary(header);
  if (!fields || typeof fields.sig !== 'string') return 'expo-signature is malformed';
  if ((fields.keyid ?? DEFAULT_KEY_ID) !== keyId)
    return `signed with keyid ${fields.keyid}, the app trusts ${keyId}`;
  if (fields.alg !== undefined && fields.alg !== SIGNATURE_ALG)
    return `alg ${fields.alg} is not ${SIGNATURE_ALG}`;
  const signature = Buffer.from(fields.sig, 'base64');
  if (signature.toString('base64') !== fields.sig) return 'the signature is not base64';
  return verify('sha256', bytes, certificate.publicKey, signature)
    ? null
    : 'the signature does not match the bytes and the certificate';
}

/** Whether the key is the certificate's: sign a probe and verify it with the certificate. */
export function keyMatchesCertificate(privateKey, certificate) {
  const probe = Buffer.from('agentico update signing probe');
  return verify('sha256', probe, certificate.publicKey, sign('sha256', probe, privateKey));
}
