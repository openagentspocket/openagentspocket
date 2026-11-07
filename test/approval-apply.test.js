// Process-boundary tests for the Host-side approval apply (spec F5).
//
// approval-apply.js runs over SSH exec as its own process, so these tests run
// it the same way: a child process with the env the app's script exports
// (HERDR_PLUGIN_CONFIG_DIR holding the runtime record the hooks write,
// HERDR_SOCKET_PATH), against a stub herdr binary that serves `agent read`
// and logs `agent send-keys`. Nothing internal is mocked.

import { test, suite, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { approvalEpisodeId } from "../src/approval-preview.js";

const APPLY_SCRIPT = fileURLToPath(new URL("../src/approval-apply.js", import.meta.url));

const PANE_ID = "w1:p2";
const TS = 1_753_305_600;
const BID = approvalEpisodeId(PANE_ID, TS);

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

const EDIT_SCREEN = [
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
const EDIT_Q = "1 -old 1 +new Do you want to make this edit to notes.txt?";

let home;
let configDir;
let stateDir;
let stubDir;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "approval-apply-"));
  configDir = join(home, "config");
  stateDir = join(home, "state");
  stubDir = join(home, "stub");
  for (const directory of [configDir, stateDir, stubDir]) mkdirSync(directory, { recursive: true });
  writeRuntime();
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

/** The runtime record the hooks write (src/usage-runtime.js). */
function writeRuntime({ herdr = join(stubDir, "herdr") } = {}) {
  const runtime = { version: 1, node: process.execPath, herdr, env: { HOME: home }, stateDir };
  writeFileSync(join(configDir, "runtime.json"), JSON.stringify(runtime));
  writeFileSync(join(configDir, "runtime-node"), `${process.execPath}\n`);
}

/**
 * The herdr stub: `agent read` answers `screen` (fails when null) after
 * `readDelayMs`; `agent send-keys` exits `sendCode`. Every call is logged.
 */
function writeHerdrStub({ screen = BASH_SCREEN, readDelayMs = 0, sendCode = 0 } = {}) {
  const response = {
    "agent read":
      screen === null
        ? { out: { error: { code: "agent_not_found" } }, code: 1, delayMs: readDelayMs }
        : {
            out: { result: { type: "pane_read", read: { pane_id: PANE_ID, text: screen } } },
            code: 0,
            delayMs: readDelayMs,
          },
    "agent send-keys": { out: { result: { type: "ok" } }, code: sendCode },
  };
  writeFileSync(join(stubDir, "response.json"), JSON.stringify(response));
  // CommonJS on purpose: the stub lives outside the plugin package.
  writeFileSync(
    join(stubDir, "herdr"),
    [
      // This node, by path: a version manager's `node` on PATH is slower than the bounds under test.
      `#!${process.execPath}`,
      'const fs = require("node:fs");',
      'const path = require("node:path");',
      "const args = process.argv.slice(2);",
      'fs.appendFileSync(path.join(__dirname, "invocations.log"), JSON.stringify({ args, socket: process.env.HERDR_SOCKET_PATH }) + "\\n");',
      'const response = JSON.parse(fs.readFileSync(path.join(__dirname, "response.json"), "utf8"));',
      'const answer = response[args.slice(0, 2).join(" ")];',
      "if (answer === undefined) process.exit(64);",
      "setTimeout(() => {",
      "  process.stdout.write(JSON.stringify(answer.out));",
      "  process.exit(answer.code);",
      "}, answer.delayMs ?? 0);",
    ].join("\n"),
    { mode: 0o755 },
  );
}

function invocations() {
  const log = join(stubDir, "invocations.log");
  if (!existsSync(log)) return [];
  return readFileSync(log, "utf8").trimEnd().split("\n").map((line) => JSON.parse(line));
}

const sentKeys = () => invocations().filter((entry) => entry.args[1] === "send-keys").map((entry) => entry.args);

const b64 = (text) => Buffer.from(text, "utf8").toString("base64url");

function args({
  pane = PANE_ID,
  bid = BID,
  ts = TS,
  decision = "approve",
  option = 1,
  prompt = BASH_Q,
  label = "Yes",
  // Generous by default, so a loaded test machine never reads as a slow
  // Host; the bounds suite sets its own.
  withinMs = 10_000,
} = {}) {
  return [
    "--pane", pane, "--bid", bid, "--ts", String(ts), "--decision", decision, "--option", String(option),
    "--prompt", b64(prompt), "--label", b64(label), "--within-ms", String(withinMs),
  ];
}

function apply(argv, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [APPLY_SCRIPT, ...argv], {
      env: {
        PATH: process.env.PATH,
        HERDR_PLUGIN_CONFIG_DIR: configDir,
        HERDR_SOCKET_PATH: "/home/dev/.config/herdr/sessions/work/herdr.sock",
        ...env,
      },
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.resume();
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, report: JSON.parse(stdout.trim()) }));
  });
}

suite("approval-apply: sending", () => {
  test("approve presses the verified option's digit once, on the session's socket", async () => {
    writeHerdrStub();

    const { status, report } = await apply(args());

    assert.equal(status, 0);
    assert.deepEqual(report, { v: 1, result: "sent", keys: ["1"] });
    assert.deepEqual(sentKeys(), [["agent", "send-keys", PANE_ID, "1"]]);
    assert.ok(invocations().every((entry) => entry.socket === "/home/dev/.config/herdr/sessions/work/herdr.sock"));
  });

  test("deny presses the No option", async () => {
    writeHerdrStub();

    const { report } = await apply(args({ decision: "deny", option: 3, label: "No" }));

    assert.equal(report.result, "sent");
    assert.deepEqual(sentKeys(), [["agent", "send-keys", PANE_ID, "3"]]);
  });

  test("the claim comes first: a second run for the episode sends nothing, from any device", async () => {
    writeHerdrStub();
    await apply(args());

    const { report } = await apply(args({ decision: "deny", option: 3, label: "No" }));

    assert.equal(report.result, "claimed");
    assert.equal(sentKeys().length, 1);
    assert.equal(invocations().filter((entry) => entry.args[1] === "read").length, 1);
    assert.deepEqual(readdirSync(join(stateDir, "approvals")), [`${BID}.json`]);
  });

  test("concurrent runs for one episode send at most once", async () => {
    writeHerdrStub();

    const reports = await Promise.all([1, 2, 3, 4].map(() => apply(args())));

    assert.equal(reports.filter(({ report }) => report.result === "sent").length, 1);
    assert.equal(reports.filter(({ report }) => report.result === "claimed").length, 3);
    assert.equal(sentKeys().length, 1);
  });

  test("a failed send says so", async () => {
    writeHerdrStub({ sendCode: 1 });

    const { report } = await apply(args());

    assert.equal(report.result, "send_failed");
  });
});

suite("approval-apply: the screen must show what the notification did", () => {
  test("another prompt on screen sends nothing", async () => {
    writeHerdrStub({ screen: BASH_SCREEN.replace("npm test\n", "npm publish\n") });

    const { report } = await apply(args());

    assert.equal(report.result, "prompt_changed");
    assert.deepEqual(sentKeys(), []);
  });

  test("the prompt compares exactly, whitespace included", async () => {
    writeHerdrStub();

    const { report } = await apply(args({ prompt: "npm  test Do you want to proceed?" }));

    assert.equal(report.result, "prompt_changed");
    assert.deepEqual(sentKeys(), []);
  });

  test("an option that moved or changed sends nothing", async () => {
    writeHerdrStub();

    const moved = await apply(args({ decision: "deny", option: 2, label: "No" }));

    assert.equal(moved.report.result, "option_changed");
    assert.deepEqual(sentKeys(), []);
  });

  test("an unreadable screen sends nothing", async () => {
    writeHerdrStub({ screen: null });

    const { report } = await apply(args());

    assert.equal(report.result, "unreadable");
    assert.deepEqual(sentKeys(), []);
  });

  test("a screen without the dialog sends nothing", async () => {
    writeHerdrStub({ screen: "❯ " });

    const { report } = await apply(args());

    assert.equal(report.result, "prompt_changed");
  });
});

suite("approval-apply: what Approve may press", () => {
  test("an always-allow Yes is never pressed", async () => {
    writeHerdrStub();

    const { report } = await apply(
      args({ option: 2, label: "Yes, and don't ask again for npm test c…" }),
    );

    assert.equal(report.result, "option_changed");
    assert.deepEqual(sentKeys(), []);
  });

  test("Deny never presses a Yes", async () => {
    writeHerdrStub();

    const { report } = await apply(args({ decision: "deny" }));

    assert.equal(report.result, "option_changed");
    assert.deepEqual(sentKeys(), []);
  });

  test("an edit is Deny only", async () => {
    writeHerdrStub({ screen: EDIT_SCREEN });

    const approve = await apply(args({ prompt: EDIT_Q }));
    assert.equal(approve.report.result, "deny_only");
    assert.deepEqual(sentKeys(), []);

    rmSync(join(stateDir, "approvals"), { recursive: true });
    const deny = await apply(args({ prompt: EDIT_Q, decision: "deny", option: 3, label: "No" }));
    assert.equal(deny.report.result, "sent");
    assert.deepEqual(sentKeys(), [["agent", "send-keys", PANE_ID, "3"]]);
  });

  test("a prompt with an invisible format character is Deny only", async () => {
    // U+202E RIGHT-TO-LEFT OVERRIDE: the command can read backwards.
    const screen = BASH_SCREEN.replace(" npm test\n", " echo \u202Emr- fr\n");
    writeHerdrStub({ screen });

    const { report } = await apply(args({ prompt: "echo \u202Emr- fr Do you want to proceed?" }));

    assert.equal(report.result, "deny_only");
    assert.deepEqual(sentKeys(), []);
  });
});

suite("approval-apply: bounds", () => {
  test("a read slower than the bound sends nothing", async () => {
    writeHerdrStub({ readDelayMs: 600 });

    const { report } = await apply(args({ withinMs: 300 }));

    assert.equal(report.result, "too_slow");
    assert.deepEqual(sentKeys(), []);
  });

  test("an episode id that is not this pane's is refused before any claim", async () => {
    writeHerdrStub();

    const { report } = await apply(args({ bid: approvalEpisodeId("w1:p9", TS) }));

    assert.equal(report.result, "bad_request");
    assert.equal(existsSync(join(stateDir, "approvals")), false);
    assert.deepEqual(invocations(), []);
  });

  test("malformed arguments are refused", async () => {
    writeHerdrStub();
    for (const argv of [
      args({ decision: "always" }),
      args({ option: 5 }),
      args({ option: 0 }),
      args({ prompt: "" }),
      ["--pane", PANE_ID],
      [...args(), "--keys", "enter"],
    ]) {
      const { report } = await apply(argv);
      assert.equal(report.result, "bad_request", argv.join(" "));
    }
    assert.deepEqual(invocations(), []);
  });

  test("without the runtime the hooks record, nothing runs", async () => {
    writeHerdrStub();
    rmSync(join(configDir, "runtime.json"));

    const { report } = await apply(args());

    assert.equal(report.result, "runtime_missing");
    assert.deepEqual(invocations(), []);
  });

  test("claims older than a day are pruned", async () => {
    writeHerdrStub();
    const directory = join(stateDir, "approvals");
    mkdirSync(directory, { recursive: true });
    const stale = join(directory, "AAAAAAAAAAA.json");
    writeFileSync(stale, "{}");
    const { utimesSync } = await import("node:fs");
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    utimesSync(stale, old, old);

    await apply(args());

    assert.deepEqual(readdirSync(directory), [`${BID}.json`]);
  });
});
