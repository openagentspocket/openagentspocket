// The registration entry's optional `platform` (additive v1): unit tests for
// src/notify-platform.js, then both hooks run as herdr runs them (a child
// process against a fake relay and a stub HERDR_BIN_PATH) with iOS and
// Android entries side by side.

import { test, suite, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createDecipheriv } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { alertPushBody, platformOf, pushTarget } from "../src/notify-platform.js";

const script = (name) => fileURLToPath(new URL(`../src/${name}`, import.meta.url));
const KEY_A = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
const KEY_B = Buffer.from(Array.from({ length: 32 }, (_, i) => 255 - i));
const APNS_TOKEN = "a".repeat(64);
const FCM_TOKEN = `cX9_a-B3dE4:APA91b${"Hk2_x-Q9".repeat(18)}`;
const PANE_ID = "w1:p2";

suite("pushTarget", () => {
  const cases = [
    ["no platform, production", { env: "production" }, { platform: "ios", env: "production" }],
    ["no platform, sandbox", { env: "sandbox" }, { platform: "ios", env: "sandbox" }],
    ["null platform", { platform: null, env: "sandbox" }, { platform: "ios", env: "sandbox" }],
    ["ios", { platform: "ios", env: "production" }, { platform: "ios", env: "production" }],
    ["android, fcm", { platform: "android", env: "fcm" }, { platform: "android", env: "fcm" }],
    ["no platform, fcm env", { env: "fcm" }, null],
    ["ios, fcm env", { platform: "ios", env: "fcm" }, null],
    ["android, an APNs env", { platform: "android", env: "production" }, null],
    ["android, no env", { platform: "android" }, null],
    ["unknown platform", { platform: "web", env: "fcm" }, null],
    ["inherited key as platform", { platform: "constructor", env: "fcm" }, null],
    ["non-string platform", { platform: 1, env: "production" }, null],
  ];
  for (const [name, entry, expected] of cases) {
    test(name, () => assert.deepEqual(pushTarget(entry), expected));
  }

  test("platformOf defaults to ios and keeps any written value", () => {
    assert.equal(platformOf({}), "ios");
    assert.equal(platformOf({ platform: "android" }), "android");
    assert.equal(platformOf({ platform: "web" }), "web");
  });
});

suite("alertPushBody", () => {
  test("an iOS body is byte-identical to earlier plugins' (no platform)", () => {
    assert.equal(
      alertPushBody({ token: APNS_TOKEN, platform: "ios", env: "sandbox" }, "E", "C"),
      `{"token":"${APNS_TOKEN}","env":"sandbox","envelope":"E","collapse":"C"}`,
    );
  });

  test("an Android body names its platform", () => {
    assert.equal(
      alertPushBody({ token: FCM_TOKEN, platform: "android", env: "fcm" }, "E", "C"),
      `{"platform":"android","token":"${FCM_TOKEN}","env":"fcm","envelope":"E","collapse":"C"}`,
    );
  });
});

let home;
let relay;
const dir = (name) => join(home, name);

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "notify-platform-"));
  for (const name of ["state", "config", "stub"]) mkdirSync(dir(name));
  relay = null;
});

afterEach(async () => {
  if (relay) await relay.close();
  rmSync(home, { recursive: true, force: true });
});

/** A fake relay: records each POST body, answers `respond(body)` ({status, body}). */
function startFakeRelay(respond = () => ({ status: 200, body: { apnsId: "x" } })) {
  const requests = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      requests.push({ path: req.url, raw, body: JSON.parse(raw) });
      const answer = respond(JSON.parse(raw));
      res.writeHead(answer.status, { "content-type": "application/json" });
      res.end(JSON.stringify(answer.body));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      relay = {
        url: `http://127.0.0.1:${server.address().port}`,
        requests,
        close: () => new Promise((done) => server.close(done)),
      };
      resolve(relay);
    });
  });
}

/** Stub herdr CLI answering the subcommands both hooks run; logs each call. */
function writeHerdrStub(status) {
  const agent = { agent: "codex", agent_status: status, pane_id: PANE_ID, workspace_id: "w1" };
  const workspace = { workspace_id: "w1", label: "Proj" };
  const answers = {
    "agent get": { result: { agent, type: "agent_info" } },
    "workspace get": { result: { workspace, type: "workspace_info" } },
    "agent list": { result: { agents: [agent], type: "agent_list" } },
    "workspace list": { result: { workspaces: [workspace], type: "workspace_list" } },
  };
  writeFileSync(join(dir("stub"), "answers.json"), JSON.stringify(answers));
  const lines = [
    "#!/usr/bin/env node",
    'const fs = require("node:fs");',
    'const path = require("node:path");',
    "const args = process.argv.slice(2);",
    'fs.appendFileSync(path.join(__dirname, "calls.log"), args.join(" ") + "\\n");',
    'const answer = JSON.parse(fs.readFileSync(path.join(__dirname, "answers.json"), "utf8"))[args.slice(0, 2).join(" ")];',
    "if (answer === undefined) process.exit(64);",
    "process.stdout.write(JSON.stringify(answer));",
  ];
  writeFileSync(join(dir("stub"), "herdr"), lines.join("\n"), { mode: 0o755 });
}

function stubCalls() {
  const log = join(dir("stub"), "calls.log");
  return existsSync(log) ? readFileSync(log, "utf8").trimEnd().split("\n") : [];
}

function writeRegistration(devices) {
  writeFileSync(join(dir("config"), "notifications.json"), JSON.stringify({ v: 1, devices }));
  writeFileSync(
    join(dir("config"), "notify.json"),
    JSON.stringify({ relay_url: relay.url, debounce_ms: 50, activity_debounce_ms: 50, retry_delay_ms: 10 }),
  );
}

function entry(token, key, env, extra = {}) {
  return { token, key: key.toString("base64url"), env, notify: { blocked: true, done: true }, ...extra };
}

function runHook(name, status) {
  const event = { event: "pane_agent_status_changed", data: { pane_id: PANE_ID, workspace_id: "w1", agent_status: status, agent: "codex" } };
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script(name)], {
      env: {
        PATH: process.env.PATH,
        HERDR_PLUGIN_EVENT_JSON: JSON.stringify(event),
        HERDR_PLUGIN_STATE_DIR: dir("state"),
        HERDR_PLUGIN_CONFIG_DIR: dir("config"),
        HERDR_BIN_PATH: join(dir("stub"), "herdr"),
      },
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

function decrypt(envelope, key) {
  const wire = JSON.parse(envelope);
  const ct = Buffer.from(wire.ct, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(wire.n, "base64url"));
  decipher.setAAD(Buffer.from("HERDR-NOTIFY:1", "utf8"));
  decipher.setAuthTag(ct.subarray(ct.length - 16));
  return JSON.parse(Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]));
}

suite("notify-hook with iOS and Android entries", () => {
  test("each deliverable entry gets its platform's body; the rest are skipped", async () => {
    await startFakeRelay();
    writeRegistration([
      entry(APNS_TOKEN, KEY_A, "sandbox"),
      entry(FCM_TOKEN, KEY_B, "fcm", { platform: "android" }),
      entry("b".repeat(64), KEY_A, "fcm"),
      entry("c".repeat(64), KEY_A, "production", { platform: "android" }),
      entry("d".repeat(64), KEY_A, "fcm", { platform: "web" }),
    ]);
    writeHerdrStub("blocked");

    const result = await runHook("notify-hook.js", "blocked");

    assert.equal(result.code, 0, result.stderr);
    assert.equal(relay.requests.length, 2);
    const byToken = new Map(relay.requests.map((request) => [request.body.token, request]));
    const ios = byToken.get(APNS_TOKEN);
    const android = byToken.get(FCM_TOKEN);
    assert.deepEqual(Object.keys(ios.body), ["token", "env", "envelope", "collapse"]);
    assert.equal(ios.body.env, "sandbox");
    assert.deepEqual(Object.keys(android.body), ["platform", "token", "env", "envelope", "collapse"]);
    assert.equal(android.body.platform, "android");
    assert.equal(android.body.env, "fcm");
    assert.equal(decrypt(ios.body.envelope, KEY_A).status, "blocked");
    assert.equal(decrypt(android.body.envelope, KEY_B).status, "blocked");
  });

  test("a 410 for an FCM token prunes only that entry, keeping unknown fields", async () => {
    await startFakeRelay((body) =>
      body.platform === "android"
        ? { status: 410, body: { reason: "Unregistered" } }
        : { status: 200, body: { apnsId: "x" } },
    );
    writeRegistration([
      entry(APNS_TOKEN, KEY_A, "production", { future_field: { kept: true } }),
      entry(FCM_TOKEN, KEY_B, "fcm", { platform: "android" }),
    ]);
    writeHerdrStub("done");

    const result = await runHook("notify-hook.js", "done");

    assert.equal(result.code, 0, result.stderr);
    const file = JSON.parse(readFileSync(join(dir("config"), "notifications.json"), "utf8"));
    assert.deepEqual(file.devices.map((device) => device.token), [APNS_TOKEN]);
    assert.deepEqual(file.devices[0].future_field, { kept: true });
  });
});

suite("activity-hook with iOS and Android entries", () => {
  // An APNs env on the Android entry's live_activity: only the platform keeps it out.
  const live = (token) => ({ live_activity: { token, env: "production", started_at: "2026-01-01T00:00:00Z" } });

  test("an Android entry never gets a Live Activity push, nor any herdr call", async () => {
    await startFakeRelay();
    writeRegistration([entry(FCM_TOKEN, KEY_B, "fcm", { platform: "android", ...live("e".repeat(64)) })]);
    writeHerdrStub("working");

    const result = await runHook("activity-hook.js", "working");

    assert.equal(result.code, 0, result.stderr);
    assert.equal(relay.requests.length, 0);
    assert.deepEqual(stubCalls(), []);
  });

  test("beside an Android entry, the iOS entry's Live Activity still updates", async () => {
    await startFakeRelay();
    writeRegistration([
      entry(FCM_TOKEN, KEY_B, "fcm", { platform: "android", ...live("e".repeat(64)) }),
      entry(APNS_TOKEN, KEY_A, "sandbox", { platform: "ios", ...live("f".repeat(64)) }),
    ]);
    writeHerdrStub("working");

    const result = await runHook("activity-hook.js", "working");

    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(relay.requests.map((request) => [request.body.kind, request.body.token]), [
      ["liveactivity", "f".repeat(64)],
    ]);
    assert.equal("platform" in relay.requests[0].body, false);
  });
});
