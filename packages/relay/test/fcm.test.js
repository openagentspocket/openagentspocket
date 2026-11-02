// Boundary tests for the relay's FCM path (`platform: "android"`): drive the
// fetch handler as Cloudflare would, with Google's token endpoint and FCM
// stubbed at the network edge (the outbound `fetch`).

import { test, suite, before } from "node:test";
import assert from "node:assert/strict";

import { createRelay } from "../src/worker.js";

const nowMs = 1_753_305_600_000;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_URL = "https://fcm.googleapis.com/v1/projects/example-project/messages:send";
// Shaped like a real FCM registration token: instance id, colon, base64url.
const FCM_TOKEN = `cX9_a-B3dE4:APA91b${"Hk2_x-Q9".repeat(18)}`;
const ENVELOPE = '{"v":1,"kid":"5-CJJlt5uLU","n":"AAECAwQFBgcICQoL","ct":"opaque"}';

/** @type {Record<string, string>} */
let apnsEnv;
/** @type {Record<string, string>} */
let fcmEnv;

function pem(der) {
  const b64 = Buffer.from(der).toString("base64");
  return `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`;
}

before(async () => {
  const ec = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  apnsEnv = {
    APNS_TEAM_ID: "TEAM123456",
    APNS_KEY_ID: "KEY1234567",
    APNS_TOPIC: "com.example.agentico",
    APNS_KEY_P8: pem(await crypto.subtle.exportKey("pkcs8", ec.privateKey)),
  };
  const rsa = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign"],
  );
  fcmEnv = {
    FCM_SERVICE_ACCOUNT_JSON: JSON.stringify({
      type: "service_account",
      project_id: "example-project",
      private_key_id: "0123abcd",
      private_key: pem(await crypto.subtle.exportKey("pkcs8", rsa.privateKey)),
      client_email: "relay@example-project.iam.gserviceaccount.com",
    }),
  };
});

const goodAndroid = { platform: "android", token: FCM_TOKEN, env: "fcm", envelope: ENVELOPE, collapse: "%5" };

function pushRequest(body, ip = "203.0.113.7") {
  return new Request("https://relay.example/push", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function fcmOk() {
  return Response.json({ name: "projects/example-project/messages/0:1753305600000000%abc" });
}

function fcmError(status, rpcStatus, errorCode) {
  const details = errorCode
    ? [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode }]
    : [];
  return Response.json({ error: { code: status, message: "x", status: rpcStatus, details } }, { status });
}

/**
 * Stub the network edge: the token endpoint answers `access-<n>` per
 * exchange, every other URL is answered by `respond`. Calls are recorded.
 */
function stubNetwork(t, respond = () => fcmOk()) {
  const calls = { token: [], push: [] };
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const call = { url: String(url), init, headers: new Headers(init.headers) };
    if (call.url === TOKEN_URL) {
      calls.token.push(call);
      return Response.json({ access_token: `access-${calls.token.length}`, expires_in: 3599 });
    }
    calls.push.push(call);
    return respond(calls.push.length);
  });
  t.mock.method(Date, "now", () => nowMs);
  return calls;
}

suite("FCM forwarding", () => {
  test("sends a data-only HTTP v1 message with high priority and the collapse key", async (t) => {
    const calls = stubNetwork(t);
    const res = await createRelay().fetch(pushRequest(goodAndroid), fcmEnv);

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { fcmId: "0:1753305600000000%abc" });
    assert.equal(calls.token.length, 1);
    assert.equal(calls.push.length, 1);
    const call = calls.push[0];
    assert.equal(call.url, FCM_URL);
    assert.equal(call.init.method, "POST");
    assert.deepEqual(call.init.headers, {
      authorization: "Bearer access-1",
      "content-type": "application/json",
    });
    assert.equal(
      call.init.body,
      `{"message":{"token":"${FCM_TOKEN}","data":{"envelope":${JSON.stringify(ENVELOPE)}},"android":{"priority":"high","collapse_key":"%5"}}}`,
    );
  });

  test("an omitted collapse key sends no collapse_key", async (t) => {
    const calls = stubNetwork(t);
    const { collapse, ...withoutCollapse } = goodAndroid;
    assert.equal((await createRelay().fetch(pushRequest(withoutCollapse), fcmEnv)).status, 200);
    assert.deepEqual(JSON.parse(calls.push[0].init.body).message.android, { priority: "high" });
  });

  test("FCM_PROJECT_ID overrides the service account's project", async (t) => {
    const calls = stubNetwork(t);
    const env = { ...fcmEnv, FCM_PROJECT_ID: "other-project" };
    await createRelay().fetch(pushRequest(goodAndroid), env);
    assert.equal(calls.push[0].url, "https://fcm.googleapis.com/v1/projects/other-project/messages:send");
  });

  test("one access token serves many pushes", async (t) => {
    const calls = stubNetwork(t);
    const relay = createRelay();
    for (let i = 0; i < 3; i += 1) await relay.fetch(pushRequest(goodAndroid), fcmEnv);
    assert.equal(calls.token.length, 1);
    assert.deepEqual(calls.push.map((call) => call.headers.get("authorization")), Array(3).fill("Bearer access-1"));
  });

  test("rejects when the data would exceed 4 KB, without calling FCM", async (t) => {
    const calls = stubNetwork(t);
    const res = await createRelay().fetch(pushRequest({ ...goodAndroid, envelope: "x".repeat(4090) }), fcmEnv);
    assert.equal(res.status, 413);
    assert.deepEqual(await res.json(), { error: "payload_too_large" });
    assert.equal(calls.token.length + calls.push.length, 0);
  });

  test("limits per FCM token", async (t) => {
    const calls = stubNetwork(t);
    const relay = createRelay();
    const env = { ...fcmEnv, RATE_LIMIT_TOKEN_PER_MIN: "1" };
    assert.equal((await relay.fetch(pushRequest(goodAndroid, "203.0.113.1"), env)).status, 200);
    assert.equal((await relay.fetch(pushRequest(goodAndroid, "203.0.113.2"), env)).status, 429);
    assert.equal(calls.push.length, 1);
  });
});

suite("FCM request validation", () => {
  const cases = [
    ["unknown platform", { ...goodAndroid, platform: "windows" }, "bad_platform"],
    ["null platform", { ...goodAndroid, platform: null }, "bad_platform"],
    ["a kind field", { ...goodAndroid, kind: "liveactivity" }, "bad_kind"],
    ["missing token", { ...goodAndroid, token: undefined }, "bad_token"],
    ["too-short token", { ...goodAndroid, token: "abc:def" }, "bad_token"],
    ["token with a slash", { ...goodAndroid, token: `${FCM_TOKEN}/x` }, "bad_token"],
    ["token with a space", { ...goodAndroid, token: `${FCM_TOKEN} x` }, "bad_token"],
    ["token over 1024 chars", { ...goodAndroid, token: "a".repeat(1025) }, "bad_token"],
    ["missing env", { ...goodAndroid, env: undefined }, "bad_env"],
    ["an APNs env", { ...goodAndroid, env: "production" }, "bad_env"],
    ["empty envelope", { ...goodAndroid, envelope: "" }, "bad_envelope"],
    ["non-string envelope", { ...goodAndroid, envelope: { v: 1 } }, "bad_envelope"],
    ["collapse over 64 bytes", { ...goodAndroid, collapse: "x".repeat(65) }, "bad_collapse"],
  ];
  for (const [name, body, error] of cases) {
    test(`rejects ${name} without calling Google`, async (t) => {
      const calls = stubNetwork(t);
      const res = await createRelay().fetch(pushRequest(body), fcmEnv);
      assert.equal(res.status, 400);
      assert.deepEqual(await res.json(), { error });
      assert.equal(calls.token.length + calls.push.length, 0);
    });
  }

  test("an FCM token is still rejected on the APNs path", async (t) => {
    stubNetwork(t);
    const { platform, ...ios } = goodAndroid;
    const res = await createRelay().fetch(pushRequest({ ...ios, env: "production" }), { ...apnsEnv, ...fcmEnv });
    assert.deepEqual(await res.json(), { error: "bad_token" });
  });
});

suite("FCM verdicts", () => {
  test("UNREGISTERED is relayed as 410 Unregistered, the plugin's prune signal", async (t) => {
    stubNetwork(t, () => fcmError(404, "NOT_FOUND", "UNREGISTERED"));
    const res = await createRelay().fetch(pushRequest(goodAndroid), fcmEnv);
    assert.equal(res.status, 410);
    assert.deepEqual(await res.json(), { reason: "Unregistered" });
  });

  const relayed = [
    ["INVALID_ARGUMENT", () => fcmError(400, "INVALID_ARGUMENT", "INVALID_ARGUMENT"), 400, "INVALID_ARGUMENT"],
    ["SENDER_ID_MISMATCH", () => fcmError(403, "PERMISSION_DENIED", "SENDER_ID_MISMATCH"), 403, "SENDER_ID_MISMATCH"],
    ["QUOTA_EXCEEDED", () => fcmError(429, "RESOURCE_EXHAUSTED", "QUOTA_EXCEEDED"), 429, "QUOTA_EXCEEDED"],
    ["a 404 without an FCM error code (never pruned)", () => fcmError(404, "NOT_FOUND"), 404, "NOT_FOUND"],
    ["a non-JSON 503", () => new Response("overloaded", { status: 503 }), 503, null],
  ];
  for (const [name, respond, status, reason] of relayed) {
    test(`${name} is relayed with its status`, async (t) => {
      stubNetwork(t, respond);
      const res = await createRelay().fetch(pushRequest(goodAndroid), fcmEnv);
      assert.equal(res.status, status);
      assert.deepEqual(await res.json(), { reason });
    });
  }

  test("a 401 drops the cached access token", async (t) => {
    const calls = stubNetwork(t, (i) => (i === 1 ? fcmError(401, "UNAUTHENTICATED") : fcmOk()));
    const relay = createRelay();
    const first = await relay.fetch(pushRequest(goodAndroid), fcmEnv);
    assert.equal(first.status, 401);
    assert.deepEqual(await first.json(), { reason: "UNAUTHENTICATED" });
    assert.equal((await relay.fetch(pushRequest(goodAndroid), fcmEnv)).status, 200);
    assert.equal(calls.token.length, 2);
    assert.equal(calls.push[1].headers.get("authorization"), "Bearer access-2");
  });

  test("an unreachable FCM is 502 fcm_unreachable", async (t) => {
    stubNetwork(t, () => {
      throw new TypeError("network down");
    });
    const res = await createRelay().fetch(pushRequest(goodAndroid), fcmEnv);
    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), { error: "fcm_unreachable" });
  });

  test("an unreachable token endpoint is 502, a refused assertion 500", async (t) => {
    const answers = [() => { throw new TypeError("down"); }, () => new Response('{"error":"invalid_grant"}', { status: 400 })];
    for (const [answer, status, error] of [[answers[0], 502, "fcm_unreachable"], [answers[1], 500, "relay_misconfigured"]]) {
      t.mock.restoreAll();
      const calls = [];
      t.mock.method(globalThis, "fetch", async (url) => (calls.push(String(url)), answer()));
      const res = await createRelay().fetch(pushRequest(goodAndroid), fcmEnv);
      assert.equal(res.status, status);
      assert.deepEqual(await res.json(), { error });
      assert.deepEqual(calls, [TOKEN_URL]);
    }
  });
});

suite("per-platform configuration", () => {
  const garbageKey = () => ({
    FCM_SERVICE_ACCOUNT_JSON: JSON.stringify({ ...JSON.parse(fcmEnv.FCM_SERVICE_ACCOUNT_JSON), private_key: "nope" }),
  });
  const cases = [
    ["android on an APNs-only relay", () => apnsEnv, goodAndroid],
    ["iOS on an FCM-only relay", () => fcmEnv, { token: "ab".repeat(32), env: "production", envelope: ENVELOPE }],
    ["a service account that is not JSON, and no APNs", () => ({ FCM_SERVICE_ACCOUNT_JSON: "{" }), goodAndroid],
    ["a service account without client_email", () => ({ FCM_SERVICE_ACCOUNT_JSON: '{"project_id":"p","private_key":"k"}' }), goodAndroid],
    ["a service account key that does not import", garbageKey, goodAndroid],
  ];
  for (const [name, env, body] of cases) {
    test(`${name} is 500 relay_misconfigured without a network call`, async (t) => {
      const calls = stubNetwork(t);
      const res = await createRelay().fetch(pushRequest(body), env());
      assert.equal(res.status, 500);
      assert.deepEqual(await res.json(), { error: "relay_misconfigured" });
      assert.equal(calls.token.length + calls.push.length, 0);
    });
  }
});

suite("APNs path with FCM configured", () => {
  const iosBody = { token: "ab".repeat(32), env: "production", envelope: ENVELOPE, collapse: "%5" };
  const exactApnsBody =
    '{"aps":{"alert":{"title":"Agentico","body":"Agent update"},"sound":"default","mutable-content":1},"envelope":"{\\"v\\":1,\\"kid\\":\\"5-CJJlt5uLU\\",\\"n\\":\\"AAECAwQFBgcICQoL\\",\\"ct\\":\\"opaque\\"}"}';

  for (const [name, body] of [["without platform", iosBody], ["with platform ios", { ...iosBody, platform: "ios" }]]) {
    test(`an alert ${name} produces the exact APNs request bytes`, async (t) => {
      const calls = stubNetwork(t, () => new Response(null, { status: 200, headers: { "apns-id": "id-1" } }));
      const res = await createRelay().fetch(pushRequest(body), { ...apnsEnv, ...fcmEnv });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { apnsId: "id-1" });
      assert.equal(calls.token.length, 0);
      const call = calls.push[0];
      assert.equal(call.url, `https://api.push.apple.com/3/device/${iosBody.token}`);
      assert.equal(call.init.body, exactApnsBody);
      const { authorization, ...headers } = call.init.headers;
      assert.match(authorization, /^bearer /);
      assert.deepEqual(Object.entries(headers), [
        ["apns-topic", "com.example.agentico"],
        ["apns-push-type", "alert"],
        ["apns-priority", "10"],
        ["content-type", "application/json"],
        ["apns-collapse-id", "%5"],
      ]);
    });
  }

  test("a Live Activity with platform ios still goes to APNs", async (t) => {
    const calls = stubNetwork(t, () => new Response(null, { status: 200 }));
    const activity = {
      platform: "ios",
      kind: "liveactivity",
      token: "ef".repeat(32),
      env: "sandbox",
      event: "update",
      priority: 5,
      timestamp: nowMs / 1000,
      counts: { working: 1, blocked: 0, done: 0 },
      envelope: ENVELOPE,
    };
    const res = await createRelay().fetch(pushRequest(activity), { ...apnsEnv, ...fcmEnv });
    assert.equal(res.status, 200);
    assert.equal(calls.push[0].url, `https://api.sandbox.push.apple.com/3/device/${activity.token}`);
    assert.equal(calls.push[0].headers.get("apns-push-type"), "liveactivity");
  });
});
