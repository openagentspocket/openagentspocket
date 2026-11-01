import { test, suite } from "node:test";
import assert from "node:assert/strict";
import { createDecipheriv } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  APPROVAL_OPTIONS_MAX,
  encryptNotificationEnvelope,
  encryptWithApprovalFallback,
  notificationKeyId,
  NotificationEnvelopeError,
} from "../src/notification-envelope.js";

const vectors = JSON.parse(
  readFileSync(new URL("../test-vectors/notification-payload-v1.json", import.meta.url), "utf8"),
);

/** Decode a vector's unpadded-base64url Notification Key to raw bytes. */
function vectorKey(vector) {
  return Buffer.from(vector.key, "base64url");
}

suite("shared vectors (encrypt direction)", () => {
  test("vector file has cases", () => {
    assert.ok(vectors.valid.length >= 3);
    assert.ok(vectors.invalid.length >= 10);
    assert.ok(vectors.invalid.some((v) => v.error === "decrypt_failed"));
  });

  for (const vector of vectors.valid) {
    test(`derives the key id: ${vector.name}`, () => {
      assert.equal(notificationKeyId(vectorKey(vector)), vector.keyId);
    });
  }

  for (const vector of vectors.valid.filter((v) => !v.decodeOnly)) {
    test(`encrypts canonically: ${vector.name}`, () => {
      const nonce = Buffer.from(JSON.parse(vector.envelope).n, "base64url");
      const envelope = encryptNotificationEnvelope(vector.payload, vectorKey(vector), { nonce });
      assert.equal(envelope, vector.envelope);
    });
  }
});

suite("encryptNotificationEnvelope", () => {
  const key = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
  // Observed-family herdr pane id (opaque `w…:p…`, uppercase included).
  // This payload only needs a non-empty string; the live shape keeps the
  // fixture from re-teaching the retired tmux-style `%N` habit.
  const payload = {
    paneId: "wV:p1",
    agentKind: "claude",
    status: "blocked",
    timestamp: 1753305600,
  };

  test("generates a fresh random nonce when none is injected", () => {
    const first = JSON.parse(encryptNotificationEnvelope(payload, key));
    const second = JSON.parse(encryptNotificationEnvelope(payload, key));
    assert.equal(Buffer.from(first.n, "base64url").length, 12);
    assert.notEqual(first.n, second.n);
    assert.notEqual(first.ct, second.ct);
    assert.equal(first.kid, notificationKeyId(key));
  });

  test("rejects invalid payloads before encrypting", () => {
    const bads = [
      { ...payload, paneId: "" },
      { ...payload, paneId: 5 },
      { ...payload, agentKind: "" },
      { ...payload, status: "" },
      { ...payload, status: undefined },
      { ...payload, timestamp: 0 },
      { ...payload, timestamp: 17.5 },
      { ...payload, timestamp: "1753305600" },
      { ...payload, project: 5 },
      { ...payload, title: {} },
      { ...payload, title: "x".repeat(257) },
      { ...payload, episodeId: 7 },
      { ...payload, approvable: 1 },
      { ...payload, prompt: ["npm test"] },
      { ...payload, prompt: "x".repeat(257) },
      { ...payload, options: "Yes" },
      { ...payload, options: ["1", "2", "3", "4", "5"] },
      { ...payload, options: ["Yes", ""] },
      { ...payload, options: ["Yes", 2] },
    ];
    for (const bad of bads) {
      assert.throws(
        () => encryptNotificationEnvelope(bad, key),
        (error) => error instanceof NotificationEnvelopeError && error.code === "bad_payload",
      );
    }
  });

  /// Absent, null, and empty must all encode the same way, so a Host that
  /// failed to resolve a display field still produces a canonical envelope.
  test("omits display fields that are absent, null, or empty", () => {
    const nonce = Buffer.alloc(12);
    const baseline = encryptNotificationEnvelope(payload, key, { nonce });
    for (const variant of [
      { ...payload, project: null, title: null },
      { ...payload, project: "", title: "" },
      { ...payload, project: undefined, title: undefined },
    ]) {
      assert.equal(encryptNotificationEnvelope(variant, key, { nonce }), baseline);
    }
    assert.notEqual(
      encryptNotificationEnvelope({ ...payload, project: "Caterm" }, key, { nonce }),
      baseline,
    );
  });

  test("omits approval fields that are absent, false, or empty", () => {
    const nonce = Buffer.alloc(12);
    const baseline = encryptNotificationEnvelope(payload, key, { nonce });
    for (const variant of [
      { ...payload, episodeId: null, approvable: false, prompt: null, options: null },
      { ...payload, episodeId: "", approvable: undefined, prompt: "", options: [] },
    ]) {
      assert.equal(encryptNotificationEnvelope(variant, key, { nonce }), baseline);
    }
  });

  test("appends the approval fields after the display fields", () => {
    const envelope = encryptNotificationEnvelope(
      {
        ...payload,
        title: "Run the tests",
        options: ["Yes", "No"],
        prompt: "npm test",
        approvable: true,
        episodeId: "AAAAAAAAAAA",
      },
      key,
    );
    const wire = JSON.parse(envelope);
    const nonce = Buffer.from(wire.n, "base64url");
    const ct = Buffer.from(wire.ct, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(Buffer.from("HERDR-NOTIFY:1", "utf8"));
    decipher.setAuthTag(ct.subarray(ct.length - 16));
    const plaintext = Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]);
    assert.deepEqual(Object.keys(JSON.parse(plaintext.toString("utf8"))), [
      "pane", "kind", "status", "ts", "title", "bid", "act", "q", "opts",
    ]);
  });

  test("a deny-only hint encodes act 2, and denyOnly alone encodes nothing", () => {
    const decrypt = (envelope) => {
      const wire = JSON.parse(envelope);
      const ct = Buffer.from(wire.ct, "base64url");
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(wire.n, "base64url"));
      decipher.setAAD(Buffer.from("HERDR-NOTIFY:1", "utf8"));
      decipher.setAuthTag(ct.subarray(ct.length - 16));
      return JSON.parse(Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]));
    };
    const approval = { episodeId: "AAAAAAAAAAA", prompt: "Do you want to create a.txt?", options: ["Yes", "No"] };
    assert.equal(decrypt(encryptNotificationEnvelope({ ...payload, ...approval, approvable: true, denyOnly: true }, key)).act, 2);
    assert.equal(decrypt(encryptNotificationEnvelope({ ...payload, ...approval, approvable: true, denyOnly: false }, key)).act, 1);
    assert.equal(decrypt(encryptNotificationEnvelope({ ...payload, ...approval, denyOnly: true }, key)).act, undefined);
    assert.throws(
      () => encryptNotificationEnvelope({ ...payload, ...approval, approvable: true, denyOnly: "yes" }, key),
      (error) => error instanceof NotificationEnvelopeError && error.code === "bad_payload",
    );
  });

  /// The worst case the hook can send stays far below APNs' 4 KB alert
  /// budget and the relay's caps, so the core fields never need trimming.
  test("a worst-case approval envelope stays under 1.5 KB", () => {
    const envelope = encryptNotificationEnvelope(
      {
        ...payload,
        project: "p".repeat(80),
        title: "t".repeat(80),
        episodeId: "AAAAAAAAAAA",
        approvable: true,
        prompt: "q".repeat(240),
        options: Array.from({ length: APPROVAL_OPTIONS_MAX }, () => "o".repeat(40)),
      },
      key,
    );
    assert.ok(Buffer.byteLength(envelope, "utf8") < 1536, `${envelope.length} bytes`);
  });

  test("rejects a key that is not 32 bytes", () => {
    assert.throws(() => encryptNotificationEnvelope(payload, Buffer.alloc(16)), TypeError);
  });

  test("rejects an injected nonce that is not 12 bytes", () => {
    assert.throws(
      () => encryptNotificationEnvelope(payload, key, { nonce: Buffer.alloc(8) }),
      TypeError,
    );
  });
});

suite("encryptWithApprovalFallback", () => {
  const key = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
  const payload = { paneId: "wV:p1", agentKind: "claude", status: "blocked", timestamp: 1753305600 };
  const nonce = Buffer.alloc(12);

  test("sends the approval fields when they pass", () => {
    const approval = { episodeId: "AAAAAAAAAAA", approvable: true, prompt: "npm test", options: ["Yes", "No"] };
    assert.equal(
      encryptWithApprovalFallback(payload, approval, key, { nonce }),
      encryptNotificationEnvelope({ ...payload, ...approval }, key, { nonce }),
    );
  });

  /// A preview the checks refuse must not cost the device its push.
  test("drops approval fields the checks refuse and keeps the push", () => {
    for (const approval of [
      { episodeId: "AAAAAAAAAAA", approvable: true, prompt: "🎉".repeat(200) },
      { episodeId: "AAAAAAAAAAA", approvable: true, options: ["a", "b", "c", "d", "e"] },
      { episodeId: "AAAAAAAAAAA", approvable: "yes" },
    ]) {
      assert.equal(
        encryptWithApprovalFallback(payload, approval, key, { nonce }),
        encryptNotificationEnvelope(payload, key, { nonce }),
      );
    }
  });

  test("a broken core payload still throws", () => {
    assert.throws(
      () => encryptWithApprovalFallback({ ...payload, paneId: "" }, {}, key),
      NotificationEnvelopeError,
    );
  });
});
