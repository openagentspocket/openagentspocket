// Process-boundary tests for the Live Activity's approval ask read (spec F5,
// R5).
//
// approval-asks.js runs over SSH exec as its own process, like
// approval-apply.js, so these tests run it the same way: a child process with
// the env the app's script exports (HERDR_PLUGIN_CONFIG_DIR holding the
// runtime record and the registration file, HERDR_SOCKET_PATH), against a
// stub herdr binary that serves `agent read` per pane. Records are written
// with the library the notify hook uses. Nothing internal is mocked.

import { test, suite, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ASK_TTL_SECONDS,
  approvalAskRecord,
  hasApprovalAsk,
  writeApprovalAsk,
} from "../src/approval-ask-records.js";
import { approvalEpisodeId } from "../src/approval-preview.js";

const ASKS_SCRIPT = fileURLToPath(new URL("../src/approval-asks.js", import.meta.url));

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
const BASH_Q = "npm test Do you want to proceed?";
const BASH_OPTS = ["Yes", "Yes, and don't ask again for npm test c…", "No"];

let home;
let configDir;
let stateDir;
let stubDir;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "approval-asks-"));
  configDir = join(home, "config");
  stateDir = join(home, "state");
  stubDir = join(home, "stub");
  for (const directory of [configDir, stateDir, stubDir]) mkdirSync(directory, { recursive: true });
  writeRuntime();
  writeRegistration();
  writeHerdrStub({});
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

/** The runtime record the hooks write (src/usage-runtime.js). */
function writeRuntime() {
  const runtime = { version: 1, node: process.execPath, herdr: join(stubDir, "herdr"), env: { HOME: home }, stateDir };
  writeFileSync(join(configDir, "runtime.json"), JSON.stringify(runtime));
  writeFileSync(join(configDir, "runtime-node"), `${process.execPath}\n`);
}

function writeRegistration(notify = { blocked: true, done: true, approve: true }, extra = {}) {
  writeFileSync(
    join(configDir, "notifications.json"),
    JSON.stringify({ v: 1, devices: [{ token: "a".repeat(64), env: "sandbox", notify, ...extra }] }),
  );
}

/**
 * The herdr stub: `agent read <pane>` answers `screens[pane]`; a pane mapped
 * to null is gone (`agent_not_found`), a missing one fails without a code,
 * and `slow` panes answer after 5 s. Every call is logged.
 */
function writeHerdrStub(screens, { slow = [] } = {}) {
  writeFileSync(join(stubDir, "screens.json"), JSON.stringify({ screens, slow }));
  // CommonJS on purpose: the stub lives outside the plugin package.
  writeFileSync(
    join(stubDir, "herdr"),
    [
      "#!/usr/bin/env node",
      'const fs = require("node:fs");',
      'const path = require("node:path");',
      "const args = process.argv.slice(2);",
      'fs.appendFileSync(path.join(__dirname, "invocations.log"), JSON.stringify({ args, socket: process.env.HERDR_SOCKET_PATH }) + "\\n");',
      'const { screens, slow } = JSON.parse(fs.readFileSync(path.join(__dirname, "screens.json"), "utf8"));',
      'if (args[0] !== "agent" || args[1] !== "read") process.exit(64);',
      "const pane = args[2];",
      "let out;",
      "let code = 0;",
      "if (!(pane in screens)) { out = { error: { code: \"internal\" } }; code = 1; }",
      "else if (screens[pane] === null) { out = { error: { code: \"agent_not_found\" } }; code = 1; }",
      "else out = { result: { type: \"pane_read\", read: { pane_id: pane, text: screens[pane] } } };",
      "setTimeout(() => {",
      "  process.stdout.write(JSON.stringify(out));",
      "  process.exit(code);",
      "}, slow.includes(pane) ? 5000 : 0);",
    ].join("\n"),
    { mode: 0o755 },
  );
}

function invocations() {
  const log = join(stubDir, "invocations.log");
  if (!existsSync(log)) return [];
  return readFileSync(log, "utf8").trimEnd().split("\n").map((line) => JSON.parse(line));
}

/** A record as the notify hook writes it for a Bash prompt on `pane`. */
function recordFor(pane, ts, { q = BASH_Q, opts = BASH_OPTS, denyOnly = false } = {}) {
  return approvalAskRecord(pane, ts, {
    episodeId: approvalEpisodeId(pane, ts),
    approvable: true,
    denyOnly,
    prompt: q,
    options: opts,
  });
}

function runAsks({ socketPath = "/home/dev/.config/herdr/herdr.sock", env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ASKS_SCRIPT], {
      env: {
        PATH: process.env.PATH,
        HERDR_PLUGIN_CONFIG_DIR: configDir,
        HERDR_SOCKET_PATH: socketPath,
        ...env,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr, report: parseReport(stdout) }));
  });
}

function parseReport(stdout) {
  const lines = stdout.trimEnd().split("\n");
  assert.equal(lines.length, 1, `one line expected, got ${JSON.stringify(stdout)}`);
  return JSON.parse(lines[0]);
}

const now = () => Math.floor(Date.now() / 1000);

suite("approval asks: reading", () => {
  test("a recorded prompt the screen still shows is answered with the push's fields", async () => {
    const ts = now() - 10;
    writeApprovalAsk(stateDir, recordFor("w1:p2", ts));
    writeHerdrStub({ "w1:p2": BASH_SCREEN });

    const result = await runAsks();

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.report, {
      v: 1,
      result: "ok",
      asks: [{ pane: "w1:p2", bid: approvalEpisodeId("w1:p2", ts), ts, act: 1, q: BASH_Q, opts: BASH_OPTS }],
    });
    assert.deepEqual(
      invocations().map((entry) => entry.args),
      [["agent", "read", "w1:p2", "--source", "visible", "--format", "text"]],
    );
    // herdr reads the session the app named.
    assert.equal(invocations()[0].socket, "/home/dev/.config/herdr/herdr.sock");
  });

  test("no records means an empty list and no reads", async () => {
    const result = await runAsks();

    assert.deepEqual(result.report, { v: 1, result: "ok", asks: [] });
    assert.equal(invocations().length, 0);
  });

  test("a pane whose prompt changed is left out and its record cleared", async () => {
    const ts = now() - 10;
    writeApprovalAsk(stateDir, recordFor("w1:p2", ts));
    writeApprovalAsk(stateDir, recordFor("w1:p3", ts));
    writeHerdrStub({
      "w1:p2": BASH_SCREEN.replace(" npm test\n", " npm run lint\n"),
      "w1:p3": BASH_SCREEN,
    });

    const result = await runAsks();

    assert.deepEqual(result.report.asks.map((ask) => ask.pane), ["w1:p3"]);
    assert.equal(hasApprovalAsk(stateDir, "w1:p2"), false);
    assert.equal(hasApprovalAsk(stateDir, "w1:p3"), true);
  });

  test("labels or act that no longer match count as a changed prompt", async () => {
    const ts = now() - 10;
    writeApprovalAsk(stateDir, recordFor("w1:p2", ts, { opts: ["Yes", "No"] }));
    writeApprovalAsk(stateDir, recordFor("w1:p3", ts, { denyOnly: true }));
    writeHerdrStub({ "w1:p2": BASH_SCREEN, "w1:p3": BASH_SCREEN });

    const result = await runAsks();

    assert.deepEqual(result.report.asks, []);
    assert.equal(hasApprovalAsk(stateDir, "w1:p2"), false);
    assert.equal(hasApprovalAsk(stateDir, "w1:p3"), false);
  });

  test("a gone Agent's record is cleared; an unreadable pane is left out but kept", async () => {
    const ts = now() - 10;
    writeApprovalAsk(stateDir, recordFor("w1:p2", ts));
    writeApprovalAsk(stateDir, recordFor("w1:p3", ts));
    writeHerdrStub({ "w1:p2": null });

    const result = await runAsks();

    assert.deepEqual(result.report.asks, []);
    assert.deepEqual(result.report.unread, ["w1:p3"]);
    assert.equal(hasApprovalAsk(stateDir, "w1:p2"), false);
    assert.equal(hasApprovalAsk(stateDir, "w1:p3"), true);
  });

  test("a slow read is abandoned within its bound", async () => {
    writeApprovalAsk(stateDir, recordFor("w1:p2", now() - 10));
    writeHerdrStub({ "w1:p2": BASH_SCREEN }, { slow: ["w1:p2"] });
    const started = Date.now();

    const result = await runAsks();

    assert.ok(Date.now() - started < 4_000);
    assert.deepEqual(result.report.asks, []);
    assert.equal(hasApprovalAsk(stateDir, "w1:p2"), true);
  });

  test("records past the time to live are pruned, never read", async () => {
    writeApprovalAsk(stateDir, recordFor("w1:p2", now() - ASK_TTL_SECONDS - 60));
    writeHerdrStub({ "w1:p2": BASH_SCREEN });

    const result = await runAsks();

    assert.deepEqual(result.report.asks, []);
    assert.equal(hasApprovalAsk(stateDir, "w1:p2"), false);
    assert.equal(invocations().length, 0);
  });

  test("pane ids reach herdr as one argument, never through a shell", async () => {
    const pane = "w1:p2; touch pwned $(id)";
    writeApprovalAsk(stateDir, recordFor(pane, now() - 10));
    writeHerdrStub({ [pane]: BASH_SCREEN });

    const result = await runAsks();

    assert.deepEqual(result.report.asks.map((ask) => ask.pane), [pane]);
    assert.deepEqual(invocations()[0].args, ["agent", "read", pane, "--source", "visible", "--format", "text"]);
    assert.equal(existsSync(join(home, "pwned")), false);
  });
});

suite("approval asks: opt-in and sessions", () => {
  test("without an approving device nothing is answered and every record goes", async () => {
    writeApprovalAsk(stateDir, recordFor("w1:p2", now() - 10));
    writeRegistration({ blocked: true, done: true, approve: false });
    writeHerdrStub({ "w1:p2": BASH_SCREEN });

    const result = await runAsks();

    assert.deepEqual(result.report, { v: 1, result: "ok", asks: [] });
    assert.equal(hasApprovalAsk(stateDir, "w1:p2"), false);
    assert.equal(invocations().length, 0);
  });

  test("a named session reads only its own records and entries", async () => {
    const sessionDir = join(stateDir, "sessions", "work");
    const ts = now() - 10;
    writeApprovalAsk(sessionDir, recordFor("w1:p2", ts));
    writeApprovalAsk(stateDir, recordFor("w1:p3", ts));
    writeRegistration({ blocked: true, done: true, approve: true }, { session: "work" });
    writeHerdrStub({ "w1:p2": BASH_SCREEN, "w1:p3": BASH_SCREEN });

    const work = await runAsks({ socketPath: "/home/dev/.config/herdr/sessions/work/herdr.sock" });
    assert.deepEqual(work.report.asks.map((ask) => ask.pane), ["w1:p2"]);

    // The default session has no approving entry of its own.
    const fallback = await runAsks();
    assert.deepEqual(fallback.report.asks, []);
    assert.equal(hasApprovalAsk(sessionDir, "w1:p2"), true);
  });

  test("without the runtime the hooks record, it says so", async () => {
    rmSync(join(configDir, "runtime.json"));

    const result = await runAsks();

    assert.deepEqual(result.report, { v: 1, result: "runtime_missing" });
  });
});
