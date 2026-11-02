import { test, suite, before } from "node:test";
import assert from "node:assert/strict";

import {
  createFcmAuth,
  FCM_SCOPE,
  FcmAuthError,
  GOOGLE_TOKEN_URL,
  TOKEN_REFRESH_MARGIN_MS,
} from "../src/fcm-auth.js";

function derToPem(der) {
  const b64 = Buffer.from(der).toString("base64");
  return `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`;
}

function decodeSegment(segment) {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

/** Stub Google's token endpoint; `respond(index)` answers each exchange. */
function stubTokenEndpoint(t, respond = (i) => tokenAnswer(`access-${i}`)) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url: String(url), init, form: new URLSearchParams(init.body) });
    return respond(calls.length);
  });
  return calls;
}

function tokenAnswer(accessToken, expiresIn = 3599) {
  return new Response(
    JSON.stringify({ access_token: accessToken, expires_in: expiresIn, token_type: "Bearer" }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

suite("createFcmAuth", () => {
  const nowMs = 1_753_305_600_000;
  /** @type {{clientEmail: string, privateKey: string, keyId: string | null}} */
  let account;
  /** @type {CryptoKey} */
  let publicKey;

  before(async () => {
    const pair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    publicKey = pair.publicKey;
    const der = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
    account = {
      clientEmail: "relay@example-project.iam.gserviceaccount.com",
      privateKey: derToPem(der),
      keyId: "0123abcd",
    };
  });

  test("exchanges an RS256 assertion with Google's claims for an access token", async (t) => {
    const calls = stubTokenEndpoint(t);
    const auth = createFcmAuth();
    assert.equal(await auth.getAccessToken(account, nowMs), "access-1");

    assert.equal(calls.length, 1);
    const call = calls[0];
    assert.equal(call.url, GOOGLE_TOKEN_URL);
    assert.equal(call.init.method, "POST");
    assert.equal(call.init.headers["content-type"], "application/x-www-form-urlencoded");
    assert.equal(call.form.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");

    const [header64, claims64, signature64] = call.form.get("assertion").split(".");
    assert.deepEqual(decodeSegment(header64), { alg: "RS256", typ: "JWT", kid: "0123abcd" });
    assert.deepEqual(decodeSegment(claims64), {
      iss: account.clientEmail,
      scope: FCM_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: nowMs / 1000,
      exp: nowMs / 1000 + 3600,
    });
    const verified = await crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      publicKey,
      Buffer.from(signature64, "base64url"),
      Buffer.from(`${header64}.${claims64}`, "utf8"),
    );
    assert.equal(verified, true);
  });

  test("omits kid when the service account has no private_key_id", async (t) => {
    const calls = stubTokenEndpoint(t);
    await createFcmAuth().getAccessToken({ ...account, keyId: null }, nowMs);
    const [header64] = calls[0].form.get("assertion").split(".");
    assert.deepEqual(decodeSegment(header64), { alg: "RS256", typ: "JWT" });
  });

  test("reuses the token until 5 minutes before it expires", async (t) => {
    const calls = stubTokenEndpoint(t);
    const auth = createFcmAuth();
    const refreshAt = nowMs + 3599 * 1000 - TOKEN_REFRESH_MARGIN_MS;
    assert.equal(await auth.getAccessToken(account, nowMs), "access-1");
    assert.equal(await auth.getAccessToken(account, refreshAt - 1), "access-1");
    assert.equal(await auth.getAccessToken(account, refreshAt), "access-2");
    assert.equal(calls.length, 2);
  });

  test("a missing expires_in counts as one hour", async (t) => {
    stubTokenEndpoint(t, (i) => new Response(JSON.stringify({ access_token: `access-${i}` })));
    const auth = createFcmAuth();
    await auth.getAccessToken(account, nowMs);
    const refreshAt = nowMs + 3600 * 1000 - TOKEN_REFRESH_MARGIN_MS;
    assert.equal(await auth.getAccessToken(account, refreshAt - 1), "access-1");
    assert.equal(await auth.getAccessToken(account, refreshAt), "access-2");
  });

  test("re-mints when the service account changes or after invalidate()", async (t) => {
    const calls = stubTokenEndpoint(t);
    const auth = createFcmAuth();
    await auth.getAccessToken(account, nowMs);
    const other = { ...account, clientEmail: "other@example-project.iam.gserviceaccount.com" };
    assert.equal(await auth.getAccessToken(other, nowMs), "access-2");
    auth.invalidate();
    assert.equal(await auth.getAccessToken(other, nowMs), "access-3");
    assert.equal(calls.length, 3);
  });

  test("a malformed private key is misconfiguration, without a network call", async (t) => {
    const calls = stubTokenEndpoint(t);
    const auth = createFcmAuth();
    for (const privateKey of [
      "not a key",
      "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n",
    ]) {
      await assert.rejects(auth.getAccessToken({ ...account, privateKey }, nowMs), {
        name: "FcmAuthError",
        code: "misconfigured",
      });
    }
    assert.equal(calls.length, 0);
  });

  const failures = [
    ["a refused assertion (400 invalid_grant)", () => new Response('{"error":"invalid_grant"}', { status: 400 }), "misconfigured"],
    ["a 200 without access_token", () => new Response("{}", { status: 200 }), "misconfigured"],
    ["a non-JSON 200", () => new Response("ok", { status: 200 }), "misconfigured"],
    ["a Google 5xx", () => new Response("down", { status: 503 }), "unreachable"],
    ["a network error", () => { throw new TypeError("network down"); }, "unreachable"],
  ];
  for (const [name, respond, code] of failures) {
    test(`${name} fails as ${code} and caches nothing`, async (t) => {
      const calls = stubTokenEndpoint(t, respond);
      const auth = createFcmAuth();
      await assert.rejects(auth.getAccessToken(account, nowMs), (error) => {
        assert.ok(error instanceof FcmAuthError);
        assert.equal(error.code, code);
        return true;
      });
      await assert.rejects(auth.getAccessToken(account, nowMs));
      assert.equal(calls.length, 2);
    });
  }
});
