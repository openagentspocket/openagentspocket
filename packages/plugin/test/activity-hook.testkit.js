// Shared harness for the Live Activity hook's process-boundary tests: scratch directories, a fake
// relay, a stub herdr and the env herdr injects.

import { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createDecipheriv } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

export const ACTIVITY_SCRIPT = fileURLToPath(new URL("../src/activity-hook.js", import.meta.url));

export const DEBOUNCE_MS = 120;
export const RETRY_DELAY_MS = 10;

export const KEY_A = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
export const KEY_B = Buffer.from(Array.from({ length: 32 }, (_, i) => 255 - i));
export const ALERT_TOKEN = "a".repeat(64);
export const ACTIVITY_TOKEN_A = "c".repeat(64);
export const ACTIVITY_TOKEN_B = "d".repeat(64);
export const PANE_ID = "w1:p2";

/** The scratch directories and fake h.relay of the running test. */
export const h = { home: "", stateDir: "", configDir: "", stubDir: "", relay: null };

export function useActivityHarness() {
beforeEach(() => {
  h.home = mkdtempSync(join(tmpdir(), "activity-hook-"));
  h.stateDir = join(h.home, "state");
  h.configDir = join(h.home, "config");
  h.stubDir = join(h.home, "stub");
  mkdirSync(h.stateDir, { recursive: true });
  mkdirSync(h.configDir, { recursive: true });
  mkdirSync(h.stubDir, { recursive: true });
  h.relay = null;
});

afterEach(async () => {
  if (h.relay) await h.relay.close();
  rmSync(h.home, { recursive: true, force: true });
});
}

export async function startFakeRelay(respond = () => ({ status: 200, body: { apnsId: "x" } })) {
  if (h.relay) await h.relay.close();
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
      h.relay = {
        url: `http://127.0.0.1:${server.address().port}`,
        requests,
        close: () => new Promise((done) => server.close(done)),
      };
      resolve(h.relay);
    });
  });
}

// `processInfo` answers `pane process-info`: an object, "fail" (exit 1),
// "invalid" (not JSON) or "hang" (never answers).
export function writeHerdrStub(
  agents,
  workspaces = [{ workspace_id: "w1", label: "Agentico" }],
  tabs = [],
  panes = [],
  processInfo = undefined,
) {
  const binPath = join(h.stubDir, "herdr");
  writeFileSync(join(h.stubDir, "response.json"), JSON.stringify({ agents, workspaces, tabs, panes, processInfo }));
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
      'if (args[0] === "agent" && args[1] === "list") {',
      '  process.stdout.write(JSON.stringify({ id: "cli:agent:list", result: { agents: response.agents, type: "agent_list" } }));',
      '} else if (args[0] === "workspace" && args[1] === "list") {',
      '  process.stdout.write(JSON.stringify({ id: "cli:workspace:list", result: { workspaces: response.workspaces, type: "workspace_list" } }));',
      '} else if (["tab", "pane"].includes(args[0]) && args[1] === "list") {',
      '  const key = args[0] + "s";',
      '  process.stdout.write(JSON.stringify({ result: { [key]: response[key] } }));',
      '} else if (args[0] === "pane" && args[1] === "process-info" && response.processInfo !== undefined) {',
      '  if (response.processInfo === "fail") process.exit(1);',
      '  if (response.processInfo === "hang") Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60_000);',
      '  process.stdout.write(response.processInfo === "invalid" ? "not json"',
      '    : JSON.stringify({ id: "cli:pane:process-info", result: { type: "pane_process_info", process_info: response.processInfo } }));',
      '} else {',
      '  process.stderr.write(`stub: unexpected subcommand ${args.join(" ")}`);',
      "  process.exit(64);",
      "}",
      "process.exit(0);",
    ].join("\n"),
    { mode: 0o755 },
  );
  return binPath;
}

export function stubInvocations() {
  const log = join(h.stubDir, "invocations.log");
  if (!existsSync(log)) return [];
  return readFileSync(log, "utf8")
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
}

export function writeConfig(overrides = {}) {
  writeFileSync(
    join(h.configDir, "notify.json"),
    JSON.stringify({
      relay_url: h.relay?.url,
      activity_debounce_ms: DEBOUNCE_MS,
      retry_delay_ms: RETRY_DELAY_MS,
      ...overrides,
    }),
  );
}

export function device({
  token = ALERT_TOKEN,
  key = KEY_A,
  env = "sandbox",
  activityToken = ACTIVITY_TOKEN_A,
  liveActivity = undefined,
  ...extra
} = {}) {
  const entry = {
    token,
    key: key.toString("base64url"),
    env,
    notify: { blocked: true, done: true },
    ...extra,
  };
  if (liveActivity === null) return entry;
  entry.live_activity =
    liveActivity === undefined
      ? { token: activityToken, started_at: "2026-01-01T00:00:00Z" }
      : liveActivity;
  return entry;
}

export function writeRegistration(devices, extra = {}) {
  writeFileSync(
    join(h.configDir, "notifications.json"),
    JSON.stringify({ v: 1, devices, ...extra }),
  );
}

export function readRegistration() {
  return JSON.parse(readFileSync(join(h.configDir, "notifications.json"), "utf8"));
}

export function writeLastState(state) {
  const dir = join(h.stateDir, "activity");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "last-state.json"), JSON.stringify(state));
}

export function listedAgent({
  pane = PANE_ID,
  status = "working",
  agent = "claude",
  title = "implement live activity",
} = {}) {
  const info = { agent, agent_status: status, pane_id: pane, workspace_id: "w1" };
  if (title !== null) {
    info.terminal_title = `⠂ ${title}`;
    info.terminal_title_stripped = title;
  }
  return info;
}

export function statusEvent(status, { agent = "claude", paneId = PANE_ID, ...dataExtra } = {}) {
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

export function runHook(event, { binPath, env = {}, nodeArgs = [] } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...nodeArgs, ACTIVITY_SCRIPT], {
      env: {
        PATH: process.env.PATH,
        HERDR_PLUGIN_EVENT_JSON: typeof event === "string" ? event : JSON.stringify(event),
        HERDR_PLUGIN_STATE_DIR: h.stateDir,
        HERDR_PLUGIN_CONFIG_DIR: h.configDir,
        HERDR_BIN_PATH: binPath ?? join(h.stubDir, "herdr"),
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

// Holds every hook in its debounce until the test releases them, so overlap
// no longer depends on two node cold starts landing within DEBOUNCE_MS. A
// preload swaps the hook's debounce sleep for one that logs the hook's pid
// and waits for a release file; the hook writes its claim before that sleep,
// so an arrival means its claim is in. ACTIVITY_TEST_NOW_MS pins Date.now().
export function debounceBarrier() {
  const dir = join(h.home, "barrier");
  const arrivals = join(dir, "arrivals.log");
  const release = join(dir, "release");
  const preload = join(dir, "preload.mjs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    preload,
    [
      'import fs from "node:fs";',
      'import timers from "node:timers/promises";',
      'import { syncBuiltinESMExports } from "node:module";',
      "const wallSleep = timers.setTimeout;",
      "timers.setTimeout = async (ms, value, options) => {",
      `  if (ms !== ${DEBOUNCE_MS}) return wallSleep(ms, value, options);`,
      `  fs.appendFileSync(${JSON.stringify(arrivals)}, process.pid + "\\n");`,
      `  while (!fs.existsSync(${JSON.stringify(release)})) {`,
      // The test h.home is gone: never outlive the test that started us.
      `    if (!fs.existsSync(${JSON.stringify(dir)})) process.exit(70);`,
      "    await wallSleep(5);",
      "  }",
      "  return value;",
      "};",
      "const pinnedNow = Number(process.env.ACTIVITY_TEST_NOW_MS);",
      "if (Number.isFinite(pinnedNow)) Date.now = () => pinnedNow;",
      "syncBuiltinESMExports();",
    ].join("\n"),
  );
  return {
    run(event, { nowMs } = {}) {
      const env = nowMs === undefined ? {} : { ACTIVITY_TEST_NOW_MS: String(nowMs) };
      return runHook(event, { env, nodeArgs: ["--import", preload] });
    },
    async arrived(count) {
      const deadline = Date.now() + 30_000;
      for (;;) {
        const pids = existsSync(arrivals) ? readFileSync(arrivals, "utf8").split("\n").filter(Boolean) : [];
        if (pids.length >= count) return pids;
        if (Date.now() > deadline) throw new Error(`debounce barrier: ${pids.length} of ${count} hooks claimed`);
        await sleep(5);
      }
    },
    release() {
      writeFileSync(release, "");
    },
  };
}

export function decryptEnvelope(envelope, key) {
  const wire = JSON.parse(envelope);
  assert.equal(wire.v, 1);
  const nonce = Buffer.from(wire.n, "base64url");
  const ct = Buffer.from(wire.ct, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(Buffer.from("HERDR-ACTIVITY:1", "utf8"));
  decipher.setAuthTag(ct.subarray(ct.length - 16));
  const plaintext = Buffer.concat([
    decipher.update(ct.subarray(0, ct.length - 16)),
    decipher.final(),
  ]);
  return { kid: wire.kid, payload: JSON.parse(plaintext.toString("utf8")) };
}

