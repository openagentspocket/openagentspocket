// FCM HTTP v1 authorization: an OAuth 2.0 access token minted from the
// deploy-time service-account JSON.
//
// The relay signs an RS256 JWT assertion with the service account's private
// key (WebCrypto, like the APNs ES256 signer) and exchanges it at Google's
// token endpoint for a ~1 hour access token. The token is cached per relay
// instance until 5 minutes before it expires, re-minted when the service
// account changes, and dropped when FCM answers 401.

import { pemToDer, signJws } from "./jws.js";

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const ASSERTION_LIFETIME_SECONDS = 3600;
const DEFAULT_TOKEN_LIFETIME_SECONDS = 3600;
export const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Why no access token could be had: `misconfigured` (the key does not
 * import, or Google refuses the assertion) or `unreachable` (network error
 * or a Google 5xx).
 */
export class FcmAuthError extends Error {
  /** @param {"misconfigured" | "unreachable"} code */
  constructor(code, message) {
    super(message);
    this.name = "FcmAuthError";
    this.code = code;
  }
}

/** @param {{clientEmail: string, privateKey: string, keyId: string | null}} account */
async function signAssertion(account, nowMs) {
  let key;
  try {
    key = await crypto.subtle.importKey(
      "pkcs8",
      pemToDer(account.privateKey),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch (error) {
    throw new FcmAuthError("misconfigured", `service account key: ${error.message}`);
  }
  const iat = Math.floor(nowMs / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  if (account.keyId !== null) {
    header.kid = account.keyId;
  }
  const claims = {
    iss: account.clientEmail,
    scope: FCM_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat,
    exp: iat + ASSERTION_LIFETIME_SECONDS,
  };
  return signJws(header, claims, key, { name: "RSASSA-PKCS1-v1_5" });
}

async function exchange(assertion) {
  let response;
  try {
    response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
    });
  } catch (error) {
    throw new FcmAuthError("unreachable", `token endpoint: ${error.message}`);
  }
  if (response.status >= 500) {
    throw new FcmAuthError("unreachable", `token endpoint answered ${response.status}`);
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    // Handled below as a refused assertion.
  }
  if (!response.ok || typeof body?.access_token !== "string" || body.access_token.length === 0) {
    throw new FcmAuthError("misconfigured", `token endpoint answered ${response.status}`);
  }
  const lifetime =
    Number.isFinite(body.expires_in) && body.expires_in > 0
      ? body.expires_in
      : DEFAULT_TOKEN_LIFETIME_SECONDS;
  return { accessToken: body.access_token, lifetimeMs: lifetime * 1000 };
}

/**
 * A caching FCM access-token source. One per relay instance.
 */
export function createFcmAuth() {
  /** @type {{clientEmail: string, privateKey: string, accessToken: string, refreshAtMs: number} | null} */
  let cached = null;

  return {
    /**
     * @param {{clientEmail: string, privateKey: string, keyId: string | null}} account
     * @param {number} nowMs
     * @returns {Promise<string>}
     * @throws {FcmAuthError}
     */
    async getAccessToken(account, nowMs) {
      if (
        cached !== null &&
        cached.clientEmail === account.clientEmail &&
        cached.privateKey === account.privateKey &&
        nowMs < cached.refreshAtMs
      ) {
        return cached.accessToken;
      }
      const { accessToken, lifetimeMs } = await exchange(await signAssertion(account, nowMs));
      cached = {
        clientEmail: account.clientEmail,
        privateKey: account.privateKey,
        accessToken,
        refreshAtMs: nowMs + lifetimeMs - TOKEN_REFRESH_MARGIN_MS,
      };
      return accessToken;
    },

    /** Forget the cached token (FCM rejected it). */
    invalidate() {
      cached = null;
    },
  };
}
