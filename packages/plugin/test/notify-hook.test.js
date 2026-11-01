// Process-boundary tests for the Agent Notification notify hook (ADR 0008).
//
// notify-hook.js runs as a herdr [[events]] hook command, so these tests
// exercise it the same way: a real child process launched with the env herdr
// injects (HERDR_PLUGIN_EVENT_JSON, state dir, config dir, HERDR_BIN_PATH),
// against an in-test fake relay HTTP server and a stub HERDR_BIN_PATH binary
// controlling the debounce re-check. The fake relay and stub binary sit at
// true external boundaries; nothing internal is mocked.
//
// The event fixture reproduces the hook payload captured empirically against
// a live herdr 0.7.5 (see the shape comment in src/notify-hook.js).

import { test, suite, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createDecipheriv } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  approvalAskRecord,
  hasApprovalAsk,
  readApprovalAsks,
  writeApprovalAsk,
} from "../src/approval-ask-records.js";
import { approvalEpisodeId } from "../src/approval-preview.js";

const NOTIFY_SCRIPT = fileURLToPath(new URL("../src/notify-hook.js", import.meta.url));

const DEBOUNCE_MS = 120;
const RETRY_DELAY_MS = 10;

// Two Notification Keys from the shared-vector fixtures (raw bytes 0..31 and
// 255..224), so decryptability here lines up with the pinned vectors.
const KEY_A = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
const KEY_B = Buffer.from(Array.from({ length: 32 }, (_, i) => 255 - i));
const TOKEN_A = "a".repeat(64);
const TOKEN_B = "b".repeat(64);

const PANE_ID = "w1:p2";

let home;
let stateDir;
let configDir;
let stubDir;
let relay;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "notify-hook-"));
  stateDir = join(home, "state");
  configDir = join(home, "config");
  stubDir = join(home, "stub");
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(configDir, { recursive: true });
  mkdirSync(stubDir, { recursive: true });
  relay = null;
});

afterEach(async () => {
  if (relay) await relay.close();
  rmSync(home, { recursive: true, force: true });
});

/** Start an in-test relay. `respond(request, index)` returns {status, body}. */
async function startFakeRelay(respond = () => ({ status: 200, body: { apnsId: "x" } })) {
  if (relay) await relay.close();
  const requests = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const request = {
        method: req.method,
        path: req.url,
        body: JSON.parse(raw),
      };
      const { status, body } = respond(request, requests.length);
      requests.push(request);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
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

/**
 * Write the HERDR_BIN_PATH stub: logs every invocation and answers the
 * subcommands the hook runs, like the real herdr CLI does — `agent get` with
 * a canned status (or an agent_not_found error when status is null),
 * `workspace get` with a canned label (or a failure when it is null), and
 * `agent read` with a canned screen (a failure when it is null), answered
 * after `screenDelayMs`.
 */
function writeHerdrStub({
  status,
  agent = "claude",
  title = undefined,
  workspaceLabel = "Proj",
  screen = null,
  screenDelayMs = 0,
}) {
  const binPath = join(stubDir, "herdr");
  const agentInfo = { agent, agent_status: status, pane_id: PANE_ID, workspace_id: "w1" };
  if (title !== undefined) {
    agentInfo.terminal_title = `⠂ ${title}`;
    agentInfo.terminal_title_stripped = title;
  }
  const response = {
    agent:
      status === null
        ? {
            out: {
              error: { code: "agent_not_found", message: "agent target not found" },
              id: "cli:agent:get",
            },
            code: 1,
          }
        : {
            out: { id: "cli:agent:get", result: { agent: agentInfo, type: "agent_info" } },
            code: 0,
          },
    workspace:
      workspaceLabel === null
        ? {
            out: { error: { code: "workspace_not_found", message: "no such workspace" }, id: "x" },
            code: 1,
          }
        : {
            out: {
              id: "cli:workspace:get",
              result: {
                workspace: { workspace_id: "w1", label: workspaceLabel },
                type: "workspace_info",
              },
            },
            code: 0,
          },
    "agent read":
      screen === null
        ? {
            out: { error: { code: "agent_not_found", message: "agent target not found" }, id: "x" },
            code: 1,
            delayMs: screenDelayMs,
          }
        : {
            out: {
              id: "cli:agent:read",
              result: {
                type: "pane_read",
                read: { pane_id: PANE_ID, source: "visible", format: "text", text: screen },
              },
            },
            code: 0,
            delayMs: screenDelayMs,
          },
  };
  writeFileSync(join(stubDir, "response.json"), JSON.stringify(response));
  // The stub is CommonJS on purpose: it lives outside the plugin package, so
  // no "type": "module" applies to it.
  writeFileSync(
    binPath,
    [
      "#!/usr/bin/env node",
      'const fs = require("node:fs");',
      'const path = require("node:path");',
      "const dir = __dirname;",
      "const args = process.argv.slice(2);",
      "fs.appendFileSync(",
      '  path.join(dir, "invocations.log"),',
      '  JSON.stringify({ args, at: Date.now() }) + "\\n",',
      ");",
      'const response = JSON.parse(fs.readFileSync(path.join(dir, "response.json"), "utf8"));',
      'const answer = response[args.slice(0, 2).join(" ")] ?? response[args[0]];',
      "if (answer === undefined) {",
      '  process.stderr.write(`stub: unexpected subcommand ${args.join(" ")}`);',
      "  process.exit(64);",
      "}",
      "setTimeout(() => {",
      "  process.stdout.write(JSON.stringify(answer.out));",
      "  process.exit(answer.code);",
      "}, answer.delayMs ?? 0);",
    ].join("\n"),
    { mode: 0o755 },
  );
  return binPath;
}

/** The invocations of one herdr subcommand, in order. */
function stubInvocationsOf(subcommand) {
  return stubInvocations().filter((entry) => entry.args[0] === subcommand);
}

function stubInvocations() {
  const log = join(stubDir, "invocations.log");
  if (!existsSync(log)) return [];
  return readFileSync(log, "utf8")
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
}

function writeConfig(overrides = {}) {
  writeFileSync(
    join(configDir, "notify.json"),
    JSON.stringify({
      relay_url: relay?.url,
      debounce_ms: DEBOUNCE_MS,
      retry_delay_ms: RETRY_DELAY_MS,
      ...overrides,
    }),
  );
}

function device({ token = TOKEN_A, key = KEY_A, env = "sandbox", notify, ...extra } = {}) {
  return {
    token,
    key: key.toString("base64url"),
    env,
    notify: notify === undefined ? { blocked: true, done: true } : notify,
    ...extra,
  };
}

function writeRegistration(devices, extra = {}) {
  writeFileSync(
    join(configDir, "notifications.json"),
    JSON.stringify({ v: 1, devices, ...extra }),
  );
}

function readRegistration() {
  return JSON.parse(readFileSync(join(configDir, "notifications.json"), "utf8"));
}

function statusEvent(status, { agent = "claude", paneId = PANE_ID, ...dataExtra } = {}) {
  const data = {
    type: "pane_agent_status_changed",
    pane_id: paneId,
    workspace_id: "w1",
    agent_status: status,
    ...dataExtra,
  };
  if (agent !== null) data.agent = agent;
  return { event: "pane_agent_status_changed", data };
}

function runHook(event, { binPath, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [NOTIFY_SCRIPT], {
      env: {
        PATH: process.env.PATH,
        HERDR_PLUGIN_EVENT_JSON: typeof event === "string" ? event : JSON.stringify(event),
        HERDR_PLUGIN_STATE_DIR: stateDir,
        HERDR_PLUGIN_CONFIG_DIR: configDir,
        HERDR_BIN_PATH: binPath ?? join(stubDir, "herdr"),
        ...env,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

/** Decrypt a POSTed envelope with the given Notification Key (test-side inverse). */
function decryptEnvelope(envelope, key) {
  const wire = JSON.parse(envelope);
  assert.equal(wire.v, 1);
  const nonce = Buffer.from(wire.n, "base64url");
  const ct = Buffer.from(wire.ct, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(Buffer.from("HERDR-NOTIFY:1", "utf8"));
  decipher.setAuthTag(ct.subarray(ct.length - 16));
  const plaintext = Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]);
  return { kid: wire.kid, payload: JSON.parse(plaintext.toString("utf8")) };
}

suite("notify-hook: sending", () => {
  test("a confirmed Blocked transition posts one decryptable push per device", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device(), device({ token: TOKEN_B, key: KEY_B, env: "production" })]);
    writeHerdrStub({ status: "blocked" });
    const before = Math.floor(Date.now() / 1000);

    const result = await runHook(statusEvent("blocked"));

    assert.equal(result.status, 0, result.stderr);
    assert.equal(relay.requests.length, 2);
    for (const request of relay.requests) {
      assert.equal(request.method, "POST");
      assert.equal(request.path, "/push");
    }
    const byToken = new Map(relay.requests.map((r) => [r.body.token, r.body]));
    const forA = byToken.get(TOKEN_A);
    const forB = byToken.get(TOKEN_B);
    assert.equal(forA.env, "sandbox");
    assert.equal(forB.env, "production");

    const a = decryptEnvelope(forA.envelope, KEY_A);
    const b = decryptEnvelope(forB.envelope, KEY_B);
    for (const { payload } of [a, b]) {
      assert.equal(payload.pane, PANE_ID);
      assert.equal(payload.kind, "claude");
      assert.equal(payload.status, "blocked");
      assert.ok(payload.ts >= before && payload.ts <= Math.floor(Date.now() / 1000) + 1);
    }
    assert.notEqual(a.kid, b.kid);
  });

  test("the collapse key is opaque, per pane, and stable across sends", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device()]);
    writeHerdrStub({ status: "blocked" });
    await runHook(statusEvent("blocked"));

    writeHerdrStub({ status: "done" });
    await runHook(statusEvent("done"));

    assert.equal(relay.requests.length, 2);
    const [first, second] = relay.requests.map((r) => r.body.collapse);
    assert.equal(typeof first, "string");
    assert.ok(first.length > 0 && first.length <= 64);
    // Same pane -> same collapse key, so a newer status replaces the older
    // notification; and the key must not leak the pane id to the relay.
    assert.equal(first, second);
    assert.ok(!first.includes(PANE_ID));

    // A different pane collapses independently.
    writeHerdrStub({ status: "blocked" });
    await runHook(statusEvent("blocked", { paneId: "w9:p9" }));
    assert.equal(relay.requests.length, 3);
    assert.notEqual(relay.requests[2].body.collapse, first);
  });

  test("a Done transition with a missing event agent falls back to the re-checked agent kind", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device()]);
    writeHerdrStub({ status: "done", agent: "codex" });

    const result = await runHook(statusEvent("done", { agent: null }));

    assert.equal(result.status, 0, result.stderr);
    assert.equal(relay.requests.length, 1);
    const { payload } = decryptEnvelope(relay.requests[0].body.envelope, KEY_A);
    assert.equal(payload.kind, "codex");
    assert.equal(payload.status, "done");
  });

  test("the payload carries the project name and the agent's task title", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device()]);
    writeHerdrStub({
      status: "blocked",
      title: "排查修复 split 按钮 UI 结构问题",
      workspaceLabel: "Caterm",
    });

    const result = await runHook(statusEvent("blocked"));

    assert.equal(result.status, 0, result.stderr);
    const { payload } = decryptEnvelope(relay.requests[0].body.envelope, KEY_A);
    assert.equal(payload.project, "Caterm");
    assert.equal(payload.title, "排查修复 split 按钮 UI 结构问题");
    // The label is resolved for the workspace the re-check reports.
    assert.deepEqual(stubInvocationsOf("workspace")[0].args, ["workspace", "get", "w1"]);
  });

  test("a title longer than the display limit is trimmed with an ellipsis", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device()]);
    const long = "重构传输层".repeat(40);
    writeHerdrStub({ status: "blocked", title: long });

    await runHook(statusEvent("blocked"));

    const { payload } = decryptEnvelope(relay.requests[0].body.envelope, KEY_A);
    assert.equal([...payload.title].length, 80);
    assert.ok(payload.title.endsWith("…"));
    assert.ok(long.startsWith([...payload.title].slice(0, 79).join("")));
  });

  test("an unresolvable workspace label just omits the project", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device()]);
    writeHerdrStub({ status: "blocked", title: "Fix the flaky test", workspaceLabel: null });

    const result = await runHook(statusEvent("blocked"));

    assert.equal(result.status, 0, result.stderr);
    const { payload } = decryptEnvelope(relay.requests[0].body.envelope, KEY_A);
    assert.equal("project" in payload, false);
    assert.equal(payload.title, "Fix the flaky test");
  });

  test("an agent with no title at all still notifies", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device()]);
    writeHerdrStub({ status: "done" });

    const result = await runHook(statusEvent("done"));

    assert.equal(result.status, 0, result.stderr);
    const { payload } = decryptEnvelope(relay.requests[0].body.envelope, KEY_A);
    assert.equal("title" in payload, false);
    assert.equal(payload.status, "done");
  });

  test("unknown event fields are ignored (lenient parse)", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device()]);
    writeHerdrStub({ status: "blocked" });

    const event = statusEvent("blocked", { future_field: "x", state_labels: { a: "b" } });
    event.top_level_future = true;
    const result = await runHook(event);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(relay.requests.length, 1);
  });
});

suite("notify-hook: debounce", () => {
  test("re-checks through HERDR_BIN_PATH only after the debounce sleep", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device()]);
    writeHerdrStub({ status: "blocked" });
    const startedAt = Date.now();

    await runHook(statusEvent("blocked"));

    const invocations = stubInvocationsOf("agent");
    assert.equal(invocations.length, 1);
    assert.deepEqual(invocations[0].args, ["agent", "get", PANE_ID]);
    assert.ok(
      invocations[0].at - startedAt >= DEBOUNCE_MS,
      `re-check ran ${invocations[0].at - startedAt}ms after start, before the ${DEBOUNCE_MS}ms debounce`,
    );
  });

  test("aborts without posting when the status moved on during the debounce", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device()]);
    writeHerdrStub({ status: "working" });

    const result = await runHook(statusEvent("blocked"));

    assert.equal(result.status, 0, result.stderr);
    assert.equal(relay.requests.length, 0);
    assert.equal(stubInvocations().length, 1);
  });

  test("aborts without posting when the agent is gone at re-check time", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device()]);
    writeHerdrStub({ status: null });

    const result = await runHook(statusEvent("blocked"));

    assert.equal(result.status, 0, result.stderr);
    assert.equal(relay.requests.length, 0);
  });

  test("fails closed when the re-check itself cannot run", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device()]);

    const result = await runHook(statusEvent("blocked"), {
      binPath: join(stubDir, "does-not-exist"),
    });

    assert.equal(result.status, 1);
    assert.equal(relay.requests.length, 0);
  });
});

suite("notify-hook: triggers and preferences", () => {
  test("working, idle, and unknown transitions never post", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device()]);
    for (const status of ["working", "idle", "unknown"]) {
      writeHerdrStub({ status });
      const result = await runHook(statusEvent(status));
      assert.equal(result.status, 0, result.stderr);
    }
    assert.equal(relay.requests.length, 0);
  });

  test("per-device preference flags gate each status", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([
      device({ notify: { blocked: true, done: false } }),
      device({ token: TOKEN_B, key: KEY_B, notify: { blocked: false, done: true } }),
    ]);

    writeHerdrStub({ status: "blocked" });
    await runHook(statusEvent("blocked"));
    assert.deepEqual(
      relay.requests.map((r) => r.body.token),
      [TOKEN_A],
    );

    writeHerdrStub({ status: "done" });
    await runHook(statusEvent("done"));
    assert.deepEqual(
      relay.requests.map((r) => r.body.token),
      [TOKEN_A, TOKEN_B],
    );
  });

  test("a missing notify flag means do not send (fail closed)", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([
      device({ notify: null }),
      device({ token: TOKEN_B, key: KEY_B, notify: { blocked: true } }),
    ]);
    writeHerdrStub({ status: "done" });

    const result = await runHook(statusEvent("done"));

    assert.equal(result.status, 0, result.stderr);
    assert.equal(relay.requests.length, 0);
  });
});

suite("notify-hook: dedupe", () => {
  test("a same-status repeat does not post again", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device()]);
    writeHerdrStub({ status: "blocked" });

    await runHook(statusEvent("blocked"));
    const repeat = await runHook(statusEvent("blocked"));

    assert.equal(repeat.status, 0, repeat.stderr);
    assert.equal(relay.requests.length, 1);
  });

  test("a confirmed different status re-arms the pane", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device()]);

    writeHerdrStub({ status: "blocked" });
    await runHook(statusEvent("blocked"));

    writeHerdrStub({ status: "working" });
    await runHook(statusEvent("working"));

    writeHerdrStub({ status: "blocked" });
    await runHook(statusEvent("blocked"));

    assert.equal(relay.requests.length, 2);
  });

  test("a flapping intermediate status does not re-arm (re-check disagrees)", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device()]);
    writeHerdrStub({ status: "blocked" });

    await runHook(statusEvent("blocked"));
    // Detection flaps to working, but by re-check time it is blocked again:
    // the clear must not happen, so the following blocked repeat stays deduped.
    await runHook(statusEvent("working"));
    const repeat = await runHook(statusEvent("blocked"));

    assert.equal(repeat.status, 0, repeat.stderr);
    assert.equal(relay.requests.length, 1);
  });

  test("dedupe is per pane", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device()]);
    writeHerdrStub({ status: "blocked" });

    await runHook(statusEvent("blocked"));
    await runHook(statusEvent("blocked", { paneId: "w9:p9" }));

    assert.equal(relay.requests.length, 2);
  });
});

suite("notify-hook: relay failures", () => {
  test("a 410 Unregistered prunes the token, preserving everything else in the file", async () => {
    await startFakeRelay((request) =>
      request.body.token === TOKEN_A
        ? { status: 410, body: { reason: "Unregistered" } }
        : { status: 200, body: { apnsId: "x" } },
    );
    writeConfig();
    writeRegistration(
      [device({ future_entry_field: "kept" }), device({ token: TOKEN_B, key: KEY_B })],
      { future_top_field: "kept" },
    );
    writeHerdrStub({ status: "blocked" });

    const result = await runHook(statusEvent("blocked"));

    assert.equal(result.status, 0, result.stderr);
    assert.equal(relay.requests.length, 2);
    const file = readRegistration();
    assert.equal(file.v, 1);
    assert.equal(file.future_top_field, "kept");
    assert.deepEqual(
      file.devices.map((d) => d.token),
      [TOKEN_B],
    );
  });

  test("a transient 5xx is retried until it succeeds", async () => {
    await startFakeRelay((_request, index) =>
      index === 0
        ? { status: 500, body: { error: "boom" } }
        : { status: 200, body: { apnsId: "x" } },
    );
    writeConfig();
    writeRegistration([device()]);
    writeHerdrStub({ status: "blocked" });

    const result = await runHook(statusEvent("blocked"));

    assert.equal(result.status, 0, result.stderr);
    assert.equal(relay.requests.length, 2);
    // The send succeeded, so the repeat is deduped as usual.
    await runHook(statusEvent("blocked"));
    assert.equal(relay.requests.length, 2);
  });

  test("a persistent failure gives up after the attempt cap and does not record a send", async () => {
    await startFakeRelay(() => ({ status: 500, body: { error: "boom" } }));
    writeConfig();
    writeRegistration([device()]);
    writeHerdrStub({ status: "blocked" });

    const result = await runHook(statusEvent("blocked"));

    assert.equal(result.status, 1);
    assert.equal(relay.requests.length, 3);
    assert.match(result.stderr, /500/);

    // Nothing was delivered, so a repeat event must try again, not dedupe.
    await startFakeRelay();
    writeConfig();
    const retry = await runHook(statusEvent("blocked"));
    assert.equal(retry.status, 0, retry.stderr);
    assert.equal(relay.requests.length, 1);
  });

  test("a permanent 4xx is not retried", async () => {
    await startFakeRelay(() => ({ status: 400, body: { error: "bad_token" } }));
    writeConfig();
    writeRegistration([device()]);
    writeHerdrStub({ status: "blocked" });

    const result = await runHook(statusEvent("blocked"));

    assert.equal(result.status, 1);
    assert.equal(relay.requests.length, 1);
  });
});

suite("notify-hook: configuration and registration file", () => {
  test("an absent registration file sends nothing", async () => {
    await startFakeRelay();
    writeConfig();
    writeHerdrStub({ status: "blocked" });

    const result = await runHook(statusEvent("blocked"));

    assert.equal(result.status, 0, result.stderr);
    assert.equal(relay.requests.length, 0);
  });

  test("a registration file with a foreign version is treated as absent", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device()]);
    const file = readRegistration();
    file.v = 2;
    writeFileSync(join(configDir, "notifications.json"), JSON.stringify(file));
    writeHerdrStub({ status: "blocked" });

    const result = await runHook(statusEvent("blocked"));

    assert.equal(result.status, 0, result.stderr);
    assert.equal(relay.requests.length, 0);
  });

  test("a corrupt registration file is treated as absent", async () => {
    await startFakeRelay();
    writeConfig();
    writeFileSync(join(configDir, "notifications.json"), "{not json");
    writeHerdrStub({ status: "blocked" });

    const result = await runHook(statusEvent("blocked"));

    assert.equal(result.status, 0, result.stderr);
    assert.equal(relay.requests.length, 0);
  });

  test("a device entry with a malformed key or env is skipped, not fatal", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([
      device({ key: Buffer.alloc(16) }),
      device({ token: TOKEN_B, key: KEY_B, env: "carrier-pigeon" }),
      device({ token: "c".repeat(64), key: KEY_A }),
    ]);
    writeHerdrStub({ status: "blocked" });

    const result = await runHook(statusEvent("blocked"));

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      relay.requests.map((r) => r.body.token),
      ["c".repeat(64)],
    );
  });

  test("an unparseable event JSON fails without contacting anything", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device()]);
    writeHerdrStub({ status: "blocked" });

    const result = await runHook("not json");

    assert.equal(result.status, 1);
    assert.equal(relay.requests.length, 0);
    assert.equal(stubInvocations().length, 0);
  });

  test("an event without a pane id or status fails leniently but loudly", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device()]);
    writeHerdrStub({ status: "blocked" });

    const result = await runHook({ event: "pane_agent_status_changed", data: { type: "x" } });

    assert.equal(result.status, 1);
    assert.equal(relay.requests.length, 0);
  });
});

suite("notify-hook: herdr sessions", () => {
  const DEFAULT_SOCKET = "/home/ada/.config/herdr/herdr.sock";
  const socketFor = (session) => `/home/ada/.config/herdr/sessions/${session}/herdr.sock`;
  const TOKEN_C = "c".repeat(64);

  test("a hook delivers to legacy entries and entries of its own session only", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([
      device(),
      device({ token: TOKEN_B, key: KEY_B, session: "" }),
      device({ token: TOKEN_C, session: "work" }),
    ]);
    writeHerdrStub({ status: "blocked" });

    const result = await runHook(statusEvent("blocked"), {
      env: { HERDR_SOCKET_PATH: socketFor("work") },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(relay.requests.map((r) => r.body.token).sort(), [TOKEN_A, TOKEN_C]);
  });

  test("an unknown socket shape delivers to legacy entries only", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([
      device(),
      device({ token: TOKEN_B, key: KEY_B, session: "" }),
      device({ token: TOKEN_C, session: "work" }),
    ]);
    writeHerdrStub({ status: "blocked" });

    const result = await runHook(statusEvent("blocked"), {
      env: { HERDR_SOCKET_PATH: "/tmp/custom-herdr.sock" },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(relay.requests.map((r) => r.body.token), [TOKEN_A]);
  });

  test("a session without its own entries makes no herdr calls", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device({ session: "work" })]);
    writeHerdrStub({ status: "blocked" });

    const result = await runHook(statusEvent("blocked"), {
      env: { HERDR_SOCKET_PATH: DEFAULT_SOCKET },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(relay.requests.length, 0);
    assert.equal(stubInvocations().length, 0);
  });

  test("the same pane id dedupes independently in each session", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device()]);
    writeHerdrStub({ status: "blocked" });

    await runHook(statusEvent("blocked"), { env: { HERDR_SOCKET_PATH: DEFAULT_SOCKET } });
    await runHook(statusEvent("blocked"), { env: { HERDR_SOCKET_PATH: socketFor("work") } });
    assert.equal(relay.requests.length, 2);

    // Each session's own repeat is still deduped.
    await runHook(statusEvent("blocked"), { env: { HERDR_SOCKET_PATH: DEFAULT_SOCKET } });
    await runHook(statusEvent("blocked"), { env: { HERDR_SOCKET_PATH: socketFor("work") } });
    assert.equal(relay.requests.length, 2);

    // The default session keeps the pre-session state path; named sessions nest.
    const marker = `${Buffer.from(PANE_ID, "utf8").toString("base64url")}.json`;
    assert.ok(existsSync(join(stateDir, "notify", marker)));
    assert.ok(existsSync(join(stateDir, "sessions", "work", "notify", marker)));
  });

  test("a 410 prunes every entry of the token, whatever its session", async () => {
    await startFakeRelay((request) =>
      request.body.token === TOKEN_A
        ? { status: 410, body: { reason: "Unregistered" } }
        : { status: 200, body: { apnsId: "x" } },
    );
    writeConfig();
    writeRegistration([
      device({ session: "" }),
      device({ key: KEY_B, session: "work" }),
      device({ token: TOKEN_B, key: KEY_B, session: "work" }),
    ]);
    writeHerdrStub({ status: "blocked" });

    const result = await runHook(statusEvent("blocked"), {
      env: { HERDR_SOCKET_PATH: DEFAULT_SOCKET },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(relay.requests.map((r) => r.body.token), [TOKEN_A]);
    assert.deepEqual(
      readRegistration().devices.map((d) => [d.token, d.session]),
      [[TOKEN_B, "work"]],
    );
  });
});

suite("notify-hook: approval preview (spec F5)", () => {
  // Claude Code's Bash permission as `herdr agent read --format text` prints it.
  const BASH_SCREEN = [
    "⏺ Bash(npm test)",
    "",
    "─".repeat(60),
    " Bash command",
    " Run the test suite",
    "╌".repeat(60),
    " npm test",
    "╌".repeat(60),
    " Do you want to proceed?",
    " ❯ 1. Yes",
    "   2. Yes, and don't ask again for npm test commands in /home/dev/app",
    "   3. No",
    "",
    " Esc to cancel · Tab to amend",
  ].join("\n");

  const approving = { blocked: true, done: true, approve: true };

  /** The `agent read` invocations the stub logged. */
  const screenReads = () => stubInvocationsOf("agent").filter((entry) => entry.args[1] === "read");

  test("a device that opted in gets the prompt, options and episode id; another does not", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device({ notify: approving }), device({ token: TOKEN_B, key: KEY_B })]);
    writeHerdrStub({ status: "blocked", screen: BASH_SCREEN });

    const result = await runHook(statusEvent("blocked"));

    assert.equal(result.status, 0, result.stderr);
    const byToken = new Map(relay.requests.map((r) => [r.body.token, r.body]));
    const opted = decryptEnvelope(byToken.get(TOKEN_A).envelope, KEY_A).payload;
    assert.equal(opted.q, "npm test Do you want to proceed?");
    assert.deepEqual(opted.opts, ["Yes", "Yes, and don't ask again for npm test c…", "No"]);
    assert.equal(opted.act, 1);
    assert.equal(opted.bid, approvalEpisodeId(PANE_ID, opted.ts));
    const plain = decryptEnvelope(byToken.get(TOKEN_B).envelope, KEY_B).payload;
    for (const field of ["bid", "act", "q", "opts"]) assert.equal(plain[field], undefined);
    assert.deepEqual(
      screenReads().map((entry) => entry.args),
      [["agent", "read", PANE_ID, "--source", "visible", "--format", "text"]],
    );
  });

  test("without an opted-in device the screen is never read", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device({ notify: { blocked: true, done: true, approve: false } })]);
    writeHerdrStub({ status: "blocked", screen: BASH_SCREEN });

    const result = await runHook(statusEvent("blocked"));

    assert.equal(result.status, 0, result.stderr);
    assert.equal(relay.requests.length, 1);
    assert.equal(decryptEnvelope(relay.requests[0].body.envelope, KEY_A).payload.q, undefined);
    assert.equal(screenReads().length, 0);
  });

  test("a Done transition never reads the screen, even when opted in", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device({ notify: approving })]);
    writeHerdrStub({ status: "done", screen: BASH_SCREEN });

    const result = await runHook(statusEvent("done"));

    assert.equal(result.status, 0, result.stderr);
    assert.equal(relay.requests.length, 1);
    assert.equal(decryptEnvelope(relay.requests[0].body.envelope, KEY_A).payload.act, undefined);
    assert.equal(screenReads().length, 0);
  });

  test("a failed screen read still notifies, without approval fields", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device({ notify: approving })]);
    writeHerdrStub({ status: "blocked", screen: null });

    const result = await runHook(statusEvent("blocked"));

    assert.equal(result.status, 0, result.stderr);
    assert.equal(relay.requests.length, 1);
    const payload = decryptEnvelope(relay.requests[0].body.envelope, KEY_A).payload;
    assert.equal(payload.status, "blocked");
    for (const field of ["bid", "act", "q", "opts"]) assert.equal(payload[field], undefined);
  });

  test("a screen read past its bound is abandoned and the push still goes", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device({ notify: approving })]);
    writeHerdrStub({ status: "blocked", screen: BASH_SCREEN, screenDelayMs: 5_000 });
    const started = Date.now();

    const result = await runHook(statusEvent("blocked"));

    assert.equal(result.status, 0, result.stderr);
    assert.ok(Date.now() - started < 4_000);
    assert.equal(relay.requests.length, 1);
    assert.equal(decryptEnvelope(relay.requests[0].body.envelope, KEY_A).payload.q, undefined);
  });

  /// An emoji is two UTF-16 code units: a prompt cut by code points failed
  /// the envelope's check, the hook threw before the loop finished, and the
  /// other devices got nothing.
  test("an emoji-heavy prompt still reaches every device", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([
      device({ notify: approving }),
      device({ token: TOKEN_B, key: KEY_B, notify: approving }),
    ]);
    const screen = BASH_SCREEN.replace(" npm test\n", ` echo ${"🎉".repeat(200)}\n`);
    writeHerdrStub({ status: "blocked", screen });

    const result = await runHook(statusEvent("blocked"));

    assert.equal(result.status, 0, result.stderr);
    assert.equal(relay.requests.length, 2);
    for (const request of relay.requests) {
      const key = request.body.token === TOKEN_A ? KEY_A : KEY_B;
      const payload = decryptEnvelope(request.body.envelope, key).payload;
      assert.ok(payload.q.length <= 240, `${payload.q.length} code units`);
      assert.ok(payload.q.endsWith("…"));
      assert.equal(payload.act, 1);
    }
  });

  test("an edit offers Deny only", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device({ notify: approving })]);
    const edit = [
      "─".repeat(60),
      " Edit file",
      " notes.txt",
      "╌".repeat(60),
      " 1 -old",
      " 1 +new",
      "╌".repeat(60),
      " Do you want to make this edit to notes.txt?",
      " ❯ 1. Yes",
      "   2. Yes, allow all edits during this session (shift+tab)",
      "   3. No",
    ].join("\n");
    writeHerdrStub({ status: "blocked", screen: edit });

    await runHook(statusEvent("blocked"));

    const payload = decryptEnvelope(relay.requests[0].body.envelope, KEY_A).payload;
    assert.equal(payload.act, 2);
    assert.equal(payload.q, "1 -old 1 +new Do you want to make this edit to notes.txt?");
  });

  test("a command with a bidi override offers Deny only", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device({ notify: approving })]);
    writeHerdrStub({ status: "blocked", screen: BASH_SCREEN.replace(" npm test\n", " echo \u202Emr- fr\n") });

    await runHook(statusEvent("blocked"));

    assert.equal(decryptEnvelope(relay.requests[0].body.envelope, KEY_A).payload.act, 2);
  });

  test("a question keeps its preview but no approval hint", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device({ notify: approving })]);
    const question = ["Which size?", "", "❯ 1. Small", "  2. Large", "  3. Type something."].join("\n");
    writeHerdrStub({ status: "blocked", screen: question });

    await runHook(statusEvent("blocked"));

    const payload = decryptEnvelope(relay.requests[0].body.envelope, KEY_A).payload;
    assert.equal(payload.q, "Which size?");
    assert.equal(payload.act, undefined);
    assert.equal(typeof payload.bid, "string");
  });
});

suite("notify-hook: approval asks for the Live Activity (spec F5, R5)", () => {
  const BASH_SCREEN = [
    "─".repeat(60),
    " Bash command",
    "╌".repeat(60),
    " npm test",
    "╌".repeat(60),
    " Do you want to proceed?",
    " ❯ 1. Yes",
    "   2. No",
  ].join("\n");
  const approving = { blocked: true, done: true, approve: true };
  const askFile = (dir = stateDir) =>
    join(dir, "approval-asks", `${Buffer.from(PANE_ID, "utf8").toString("base64url")}.json`);
  const now = () => Math.floor(Date.now() / 1000);

  /** An ask a previous Blocked episode left for the pane. */
  function writeOlderAsk(dir = stateDir) {
    const ts = now() - 60;
    writeApprovalAsk(
      dir,
      approvalAskRecord(PANE_ID, ts, {
        episodeId: approvalEpisodeId(PANE_ID, ts),
        approvable: true,
        denyOnly: false,
        prompt: "ls Do you want to proceed?",
        options: ["Yes", "No"],
      }),
    );
  }

  test("an opted-in Blocked push records the fields it carries, the same bid included", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device({ notify: approving })]);
    writeHerdrStub({ status: "blocked", screen: BASH_SCREEN });

    const result = await runHook(statusEvent("blocked"));

    assert.equal(result.status, 0, result.stderr);
    const payload = decryptEnvelope(relay.requests[0].body.envelope, KEY_A).payload;
    const [ask] = readApprovalAsks(stateDir, { nowSeconds: payload.ts });
    assert.deepEqual(ask, {
      v: 1,
      pane: PANE_ID,
      bid: payload.bid,
      ts: payload.ts,
      act: payload.act,
      q: payload.q,
      opts: payload.opts,
    });
    assert.equal(statSync(askFile()).mode & 0o777, 0o600);
  });

  test("the ask is recorded even when the relay refuses the push", async () => {
    await startFakeRelay(() => ({ status: 400, body: {} }));
    writeConfig();
    writeRegistration([device({ notify: approving })]);
    writeHerdrStub({ status: "blocked", screen: BASH_SCREEN });

    await runHook(statusEvent("blocked"));

    assert.equal(hasApprovalAsk(stateDir, PANE_ID), true);
  });

  test("without an approving device no ask is recorded, and an older one goes", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device({ notify: { blocked: true, done: true, approve: false } })]);
    writeHerdrStub({ status: "blocked", screen: BASH_SCREEN });
    writeOlderAsk();

    const result = await runHook(statusEvent("blocked"));

    assert.equal(result.status, 0, result.stderr);
    assert.equal(relay.requests.length, 1);
    assert.equal(hasApprovalAsk(stateDir, PANE_ID), false);
  });

  test("without any device for Blocked an older ask goes before the debounce", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device({ notify: { blocked: false, done: true, approve: true } })]);
    writeHerdrStub({ status: "blocked", screen: BASH_SCREEN });
    writeOlderAsk();

    await runHook(statusEvent("blocked"));

    assert.equal(hasApprovalAsk(stateDir, PANE_ID), false);
    assert.equal(stubInvocations().length, 0);
  });

  test("a prompt without an answer, or an unreadable screen, replaces an older ask with none", async () => {
    for (const screen of [["Which size?", "", "❯ 1. Small", "  2. Large"].join("\n"), null]) {
      await startFakeRelay();
      writeConfig();
      writeRegistration([device({ notify: approving })]);
      writeHerdrStub({ status: "blocked", screen });
      clearLastNotifiedMarker();
      writeOlderAsk();

      await runHook(statusEvent("blocked"));

      assert.equal(relay.requests.length, 1);
      assert.equal(hasApprovalAsk(stateDir, PANE_ID), false);
    }
  });

  test("a confirmed departure from Blocked clears the ask, even with nothing to re-arm", async () => {
    writeConfig();
    writeRegistration([device({ notify: approving })]);
    writeHerdrStub({ status: "working" });
    writeOlderAsk();

    const result = await runHook(statusEvent("working"));

    assert.equal(result.status, 0, result.stderr);
    assert.equal(hasApprovalAsk(stateDir, PANE_ID), false);
  });

  test("a Done that follows clears the ask and still notifies", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device({ notify: approving })]);
    writeHerdrStub({ status: "done" });
    writeOlderAsk();

    await runHook(statusEvent("done"));

    assert.equal(relay.requests.length, 1);
    assert.equal(hasApprovalAsk(stateDir, PANE_ID), false);
  });

  test("a flap back to Blocked keeps the ask", async () => {
    writeConfig();
    writeRegistration([device({ notify: approving })]);
    writeHerdrStub({ status: "blocked", screen: BASH_SCREEN });
    writeOlderAsk();

    await runHook(statusEvent("working"));

    assert.equal(hasApprovalAsk(stateDir, PANE_ID), true);
  });

  test("a gone Agent's ask is cleared", async () => {
    writeConfig();
    writeRegistration([device({ notify: approving })]);
    writeHerdrStub({ status: null });
    writeOlderAsk();

    await runHook(statusEvent("idle"));

    assert.equal(hasApprovalAsk(stateDir, PANE_ID), false);
  });

  test("asks are kept per herdr session", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device({ notify: approving, session: "work" })]);
    writeHerdrStub({ status: "blocked", screen: BASH_SCREEN });
    writeOlderAsk();

    await runHook(statusEvent("blocked"), {
      env: { HERDR_SOCKET_PATH: "/home/dev/.config/herdr/sessions/work/herdr.sock" },
    });

    assert.equal(hasApprovalAsk(join(stateDir, "sessions", "work"), PANE_ID), true);
    // The default session's ask is not this session's to touch.
    assert.equal(JSON.parse(readFileSync(askFile(), "utf8")).q, "ls Do you want to proceed?");
  });

  /** Forget the pane's dedupe marker so the next Blocked notifies again. */
  function clearLastNotifiedMarker() {
    rmSync(join(stateDir, "notify"), { recursive: true, force: true });
  }
});
