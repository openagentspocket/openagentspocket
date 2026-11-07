// Process-boundary tests: the hook runs as Claude Code runs it, a child process
// with its JSON on stdin, against a fake relay.

import { test, suite, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createDecipheriv } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { applyProgramHooks } from "../src/install-program-hooks.js";
import {
  activityOf,
  herdrOwnsThisPane,
  hookPaneId,
  normalizedInput,
  parseClaudeHook,
  parseCodexHook,
  parseGrokHook,
  parseHermesHook,
  parseOpenCodeHook,
  parsePiHook,
} from "../src/program-hook.js";

const HOOK = fileURLToPath(new URL("../src/program-hook.js", import.meta.url));
const KEY = Buffer.from(Array.from({ length: 32 }, (_, i) => i)).toString("base64url");

// A run from inside a herdr pane must behave like one outside it: herdr would own the hooks.
delete process.env.HERDR_ENV;
delete process.env.HERDR_SOCKET_PATH;

let home;
let relay;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "program-hook-"));
});

afterEach(async () => {
  if (relay) await new Promise((done) => relay.server.close(done));
  relay = null;
  rmSync(home, { recursive: true, force: true });
});

async function startRelay(status = 200) {
  const requests = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      requests.push(JSON.parse(raw));
      res.writeHead(status, { "content-type": "application/json" });
      res.end("{}");
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  relay = { server, requests, url: `http://127.0.0.1:${server.address().port}` };
}

function register({ blocked = true, done = true, approve = false } = {}) {
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, "notify.json"), JSON.stringify({ relay_url: relay.url, retry_delay_ms: 1 }));
  writeFileSync(
    join(home, "notifications.json"),
    JSON.stringify({
      v: 1,
      devices: [{ token: "a".repeat(64), env: "sandbox", key: KEY, notify: { blocked, done, approve } }],
    }),
  );
}

function runHook(input, env = {}, program = "claude") {
  const clean = { ...process.env };
  for (const name of ["TMUX_PANE", "HERDR_ENV", "HERDR_SOCKET_PATH"]) delete clean[name];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [HOOK, program], {
      env: { ...clean, OAP_CONFIG_DIR: home, ...env },
      stdio: ["pipe", "ignore", "pipe"],
    });
    child.on("close", (code) => resolve(code));
    child.stdin.end(typeof input === "string" ? input : JSON.stringify(input));
  });
}

const PERMISSION = {
  hook_event_name: "Notification",
  notification_type: "permission_prompt",
  message: "Claude needs your permission",
  session_id: "abc",
  cwd: "/srv/api",
};
const STOP = { hook_event_name: "Stop", stop_hook_active: false, session_id: "abc", cwd: "/srv/api" };

suite("parseClaudeHook", () => {
  test("a permission prompt is Blocked and an end of turn is Done", () => {
    assert.equal(parseClaudeHook(PERMISSION).status, "blocked");
    assert.equal(parseClaudeHook(STOP).status, "done");
  });

  test("everything else says nothing", () => {
    assert.equal(parseClaudeHook({ ...STOP, stop_hook_active: true }), null);
    assert.equal(parseClaudeHook({ ...PERMISSION, notification_type: "idle_prompt" }), null);
    assert.equal(parseClaudeHook({ hook_event_name: "PreToolUse" }), null);
    assert.equal(parseClaudeHook(null), null);
  });
});

suite("the other programs", () => {
  test("Codex: a permission request is Blocked, a Stop is Done", () => {
    const ask = { hook_event_name: "PermissionRequest", tool_name: "Bash" };
    assert.deepEqual(parseCodexHook(ask), { status: "blocked", title: "Bash" });
    assert.equal(parseCodexHook({ hook_event_name: "Stop" }).status, "done");
    assert.equal(parseCodexHook({ hook_event_name: "PreToolUse" }), null);
  });

  test("OpenCode: permission.asked is Blocked, session.idle is Done", () => {
    assert.equal(parseOpenCodeHook({ event: "permission.asked" }).status, "blocked");
    assert.equal(parseOpenCodeHook({ event: "session.idle" }).status, "done");
    assert.equal(parseOpenCodeHook({ event: "message.updated" }), null);
  });

  test("Hermes: an approval request is Blocked, a finished turn is Done", () => {
    const ask = { event: "pre_approval_request", command: "rm -rf x" };
    assert.deepEqual(parseHermesHook(ask), { status: "blocked", title: "rm -rf x" });
    assert.equal(parseHermesHook({ event: "post_llm_call" }).status, "done");
  });

  test("an opted-in device's Blocked push reads the screen through the bridge's launcher", async () => {
    await startRelay();
    register({ approve: true });
    const asked = join(home, "asked");
    const launcher = join(home, "launcher");
    writeFileSync(launcher, `#!/bin/sh\necho "$@" > '${asked}'\n`, { mode: 0o755 });
    const runtime = { version: 1, node: process.execPath, herdr: launcher, stateDir: home, env: { HOME: home } };
    writeFileSync(join(home, "runtime.json"), JSON.stringify(runtime));
    writeFileSync(join(home, "runtime-node"), `${process.execPath}\n`);

    assert.equal(await runHook(PERMISSION, { TMUX_PANE: "%3" }), 0);
    assert.equal(readFileSync(asked, "utf8").trim(), "agent read %3 --source visible --format text");
    assert.equal(relay.requests.length, 1);
  });

  test("a device that did not opt in costs no screen read", async () => {
    await startRelay();
    register();
    const asked = join(home, "asked");
    const launcher = join(home, "launcher");
    writeFileSync(launcher, `#!/bin/sh\ntouch '${asked}'\n`, { mode: 0o755 });
    assert.equal(await runHook(PERMISSION, { TMUX_PANE: "%3" }), 0);
    assert.equal(existsSync(asked), false);
  });

  test("reads Pi, omp and Grok Build events", () => {
    const ask = { event: "tool_approval_requested", title: "bash" };
    assert.deepEqual(parsePiHook(ask), { status: "blocked", title: "bash" });
    assert.equal(parsePiHook({ event: "done" }).status, "done");
    assert.equal(parsePiHook({ event: "agent_start" }), null);
    assert.equal(activityOf({ event: "agent_start" }, null), "working");

    const stop = normalizedInput("grok", { hookEventName: "Stop", sessionId: "s1" });
    assert.equal(stop.session_id, "s1");
    assert.equal(parseGrokHook(stop).status, "done");
    const asks = normalizedInput("grok", { hookEventName: "Notification", message: "Run ls?" });
    assert.deepEqual(parseGrokHook(asks), { status: "blocked", title: "Run ls?" });
    assert.equal(parseGrokHook(normalizedInput("grok", { hookEventName: "PostToolUse" })), null);
  });

  test("the Pi extension forwards an ask and stays quiet off the TUI", async () => {
    await startRelay();
    register();
    mkdirSync(join(home, ".pi", "agent"), { recursive: true });
    const ctx = { node: process.execPath, hook: HOOK };
    applyProgramHooks({ env: {}, home, ctx });
    process.env.OAP_CONFIG_DIR = home;
    const file = join(home, ".pi", "agent", "extensions", "agentico-notify.ts");
    const { default: extension } = await import(pathToFileURL(file).href);
    const handlers = new Map();
    extension({ on: (name, handler) => handlers.set(name, handler) });

    const sessionManager = { getSessionId: () => "s1" };
    const ask = handlers.get("tool_approval_requested");
    ask({ toolName: "bash" }, { mode: "rpc", sessionManager });
    ask({ toolName: "bash" }, { mode: "tui", cwd: "/srv/api", sessionManager });
    delete process.env.OAP_CONFIG_DIR;
    for (let i = 0; i < 100 && relay.requests.length === 0; i += 1) {
      await new Promise((done) => setTimeout(done, 50));
    }
    await new Promise((done) => setTimeout(done, 100));
    assert.equal(relay.requests.length, 1);
  });

  test("the OpenCode plugin file runs and reaches the relay", async () => {
    await startRelay();
    register();
    const config = join(home, "xdg", "opencode");
    mkdirSync(config, { recursive: true });
    const env = { XDG_CONFIG_HOME: join(home, "xdg") };
    const ctx = { node: process.execPath, hook: HOOK };
    assert.deepEqual(applyProgramHooks({ env, home: join(home, "none"), ctx }), ["opencode"]);
    process.env.OAP_CONFIG_DIR = home;
    const url = pathToFileURL(join(config, "plugins", "agentico-notify.js")).href;
    const { AgenticoNotify } = await import(url);
    const plugin = await AgenticoNotify({ directory: "/srv/api" });
    await plugin.event({ event: { type: "message.updated" } });
    await plugin.event({ event: { type: "session.idle", properties: { sessionID: "s" } } });
    delete process.env.OAP_CONFIG_DIR;
    for (let i = 0; i < 100 && relay.requests.length === 0; i += 1) {
      await new Promise((done) => setTimeout(done, 50));
    }
    assert.equal(relay.requests.length, 1);
  });
});

suite("pane records", () => {
  test("a hook in a tmux pane says what runs there, without any device", async () => {
    await runHook({ hook_event_name: "SessionStart", session_id: "s1" }, { TMUX_PANE: "%3" });
    const file = join(home, "panes", `${Buffer.from("%3").toString("base64url")}.json`);
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), {
      agent: "claude",
      session: "s1",
      status: "idle",
      pane: "%3",
    });
    await runHook({ hook_event_name: "UserPromptSubmit" }, { TMUX_PANE: "%3" });
    assert.equal(JSON.parse(readFileSync(file, "utf8")).status, "working");
    assert.equal(JSON.parse(readFileSync(file, "utf8")).session, "s1");
  });

  test("outside tmux nothing is recorded", async () => {
    await runHook({ hook_event_name: "SessionStart", session_id: "s1" });
    assert.equal(existsSync(join(home, "panes")), false);
  });
});

suite("where a hook runs", () => {
  test("the tmux pane names it, else the program's session", () => {
    assert.equal(hookPaneId({ TMUX_PANE: "%3" }, { session_id: "abc" }), "%3");
    assert.equal(hookPaneId({}, { session_id: "abc" }), "abc");
    assert.equal(hookPaneId({}, {}), null);
  });

  test("herdr's own events own a pane inside herdr", () => {
    assert.equal(herdrOwnsThisPane({ HERDR_ENV: "1" }), true);
    assert.equal(herdrOwnsThisPane({ TMUX_PANE: "%3" }), false);
  });
});

suite("program-hook process", () => {
  test("posts one push for an ask and exits 0", async () => {
    await startRelay();
    register();
    assert.equal(await runHook(PERMISSION, { TMUX_PANE: "%3" }), 0);
    assert.equal(relay.requests.length, 1);
    assert.equal(relay.requests[0].token, "a".repeat(64));
    assert.ok(relay.requests[0].envelope);
  });

  test("two asks in one turn are two pushes: a hook event is never a repeat", async () => {
    await startRelay();
    register();
    await runHook(PERMISSION);
    await runHook(PERMISSION);
    assert.equal(relay.requests.length, 2);
  });

  test("a device that did not opt in gets nothing", async () => {
    await startRelay();
    register({ done: false });
    await runHook(STOP);
    assert.equal(relay.requests.length, 0);
  });

  test("inside herdr it stays quiet", async () => {
    await startRelay();
    register();
    await runHook(PERMISSION, { HERDR_ENV: "1" });
    assert.equal(relay.requests.length, 0);
  });

  test("nothing the hook meets fails the Agent", async () => {
    await startRelay(500);
    register();
    assert.equal(await runHook(STOP), 0);
    assert.equal(await runHook("not json"), 0);
    assert.equal(await runHook(STOP, {}, "unknown"), 0);
  });
});

suite("Live Activity asks on tmux", () => {
  const SCREEN = " npm test\n Do you want to proceed?\n ❯ 1. Yes\n   2. No\n";
  const ASKS = fileURLToPath(new URL("../src/approval-asks.js", import.meta.url));
  const pane = { TMUX_PANE: "%3" };
  let stateDir;
  let shown;

  const askPath = () => join(stateDir, "approval-asks", `${Buffer.from("%3").toString("base64url")}.json`);
  const ask = () => JSON.parse(readFileSync(askPath(), "utf8"));

  function pushed() {
    const wire = JSON.parse(relay.requests[0].envelope);
    const ct = Buffer.from(wire.ct, "base64url");
    const key = Buffer.from(KEY, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(wire.n, "base64url"));
    decipher.setAAD(Buffer.from("HERDR-NOTIFY:1"));
    decipher.setAuthTag(ct.subarray(-16));
    return JSON.parse(Buffer.concat([decipher.update(ct.subarray(0, -16)), decipher.final()]).toString());
  }

  // A Host as the bridge's `install` leaves it: launcher, runtime, and state apart from config.
  beforeEach(async () => {
    await startRelay();
    register({ approve: true });
    stateDir = join(home, "state");
    mkdirSync(stateDir);
    shown = join(home, "screen");
    writeFileSync(shown, SCREEN);
    const launcher = join(home, "launcher");
    writeFileSync(launcher, `#!/bin/sh\ncat '${shown}'\n`, { mode: 0o755 });
    spawnSync(launcher); // A fresh script's first exec can outlast the hook's read bound.
    const runtime = { version: 1, node: process.execPath, herdr: launcher, stateDir, env: { HOME: home } };
    writeFileSync(join(home, "runtime.json"), JSON.stringify(runtime));
    writeFileSync(join(home, "runtime-node"), `${process.execPath}\n`);
  });

  test("a Blocked push records the fields it carries", async () => {
    assert.equal(await runHook(PERMISSION, pane), 0);
    const { pane: id, bid, ts, act, q, opts } = ask();
    assert.deepEqual({ id, act, opts }, { id: "%3", act: 1, opts: ["Yes", "No"] });
    const payload = pushed();
    assert.deepEqual([payload.bid, payload.ts, payload.q, payload.opts], [bid, ts, q, opts]);
  });

  test("the app's read answers it on a bridge Host, until the screen moves on", async () => {
    await runHook(PERMISSION, pane);
    const socket = join(home, "herdr", "herdr.sock");
    const env = { ...process.env, HERDR_PLUGIN_CONFIG_DIR: home, HERDR_SOCKET_PATH: socket };
    const read = () => JSON.parse(spawnSync(process.execPath, [ASKS], { env, encoding: "utf8" }).stdout);
    assert.deepEqual(read().asks.map((one) => one.bid), [ask().bid]);
    writeFileSync(shown, "$ ");
    assert.deepEqual(read(), { v: 1, result: "ok", asks: [] });
    assert.equal(existsSync(askPath()), false);
  });

  for (const [name, input] of [
    ["the end of the turn", STOP],
    ["a new prompt", { hook_event_name: "UserPromptSubmit", session_id: "abc" }],
  ]) {
    test(`${name} clears the ask, whether or not a device hears it`, async () => {
      await runHook(PERMISSION, pane);
      assert.equal(existsSync(askPath()), true);
      rmSync(join(home, "notifications.json"));
      assert.equal(await runHook(input, pane), 0);
      assert.equal(existsSync(askPath()), false);
    });
  }

  for (const hook_event_name of ["PreToolUse", "PostToolUse"]) {
    test(`${hook_event_name} keeps the ask: the prompt may still be open`, async () => {
      await runHook(PERMISSION, pane);
      await runHook({ hook_event_name, session_id: "abc" }, pane);
      assert.equal(existsSync(askPath()), true);
    });
  }

  test("a Blocked push nobody can answer leaves no older ask behind", async () => {
    await runHook(PERMISSION, pane);
    writeFileSync(shown, "$ ");
    await runHook(PERMISSION, pane);
    assert.equal(existsSync(askPath()), false);

    writeFileSync(shown, SCREEN);
    await runHook(PERMISSION, pane);
    register({ approve: false });
    await runHook(PERMISSION, pane);
    assert.equal(existsSync(askPath()), false);

    register({ approve: true });
    await runHook(PERMISSION, pane);
    register({ blocked: false });
    await runHook(PERMISSION, pane);
    assert.equal(existsSync(askPath()), false);
  });

  test("outside a tmux pane there is no screen to answer, so no ask", async () => {
    await runHook(PERMISSION);
    assert.equal(existsSync(join(stateDir, "approval-asks")), false);
  });

  test("an ask that cannot be written or cleared costs the buttons, never the push", async () => {
    writeFileSync(join(stateDir, "approval-asks"), "in the way");
    assert.equal(await runHook(PERMISSION, pane), 0);
    assert.equal(await runHook(STOP, pane), 0);
    assert.equal(relay.requests.length, 2);
  });
});
