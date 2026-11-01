// Compact JWS signing shared by the APNs (ES256) and FCM (RS256) signers.
//
// WebCrypto only — no Node built-ins — so the module runs unchanged on
// Cloudflare Workers and under Node's test runner.

const encoder = new TextEncoder();

/** @param {Uint8Array} bytes */
export function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** Decode the PEM framing of a PKCS#8 private key (.p8, service account) to DER bytes. */
export function pemToDer(pem) {
  const body = pem.replace(/-----(?:BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const binary = atob(body); // throws on invalid base64
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Sign `header.claims` as a compact JWS. Both WebCrypto ECDSA (raw r||s) and
 * RSASSA-PKCS1-v1_5 signatures are already in JWS byte format.
 *
 * @param {object} header
 * @param {object} claims
 * @param {CryptoKey} key
 * @param {AlgorithmIdentifier | EcdsaParams} algorithm
 * @returns {Promise<string>}
 */
export async function signJws(header, claims, key, algorithm) {
  const headerSegment = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const claimsSegment = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  const signingInput = `${headerSegment}.${claimsSegment}`;
  const signature = await crypto.subtle.sign(algorithm, key, encoder.encode(signingInput));
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}
