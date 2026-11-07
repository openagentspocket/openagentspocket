// Process-boundary tests: the hook runs as Claude Code runs it, a child process
// with its JSON on stdin, against a fake relay.

import { test, suite, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { applyProgramHooks, withHooks, withoutHooks } from "../src/install-program-hooks.js";
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
const INSTALL = fileURLToPath(new URL("../src/install-program-hooks.js", import.meta.url));
const KEY = Buffer.from(Array.from({ length: 32 }, (_, i) => i)).toString("base64url");
const COMMAND = "'/n' '/x/program-hook.js' claude";
const GROUPS = { Notification: "permission_prompt", Stop: null };

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

function register({ blocked = true, done = true } = {}) {
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, "notify.json"), JSON.stringify({ relay_url: relay.url, retry_delay_ms: 1 }));
  writeFileSync(
    join(home, "notifications.json"),
    JSON.stringify({
      v: 1,
      devices: [{ token: "a".repeat(64), env: "sandbox", key: KEY, notify: { blocked, done } }],
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

  test("installs the Pi extension and the Grok hook file, once, and removes them", () => {
    mkdirSync(join(home, ".pi", "agent"), { recursive: true });
    mkdirSync(join(home, ".omp", "agent"), { recursive: true });
    mkdirSync(join(home, ".grok", "hooks"), { recursive: true });
    const own = join(home, ".grok", "hooks", "mine.json");
    writeFileSync(own, "{}");
    const ctx = { node: process.execPath, hook: HOOK };
    const touched = applyProgramHooks({ env: {}, home, ctx });
    applyProgramHooks({ env: {}, home, ctx });
    assert.deepEqual(touched.sort(), ["grok", "omp", "pi"]);

    const pi = readFileSync(join(home, ".pi", "agent", "extensions", "agentico-notify.ts"), "utf8");
    assert.match(pi, /"agent_settled"/);
    assert.doesNotMatch(pi, /__[A-Z_]+__/);
    const omp = readFileSync(join(home, ".omp", "agent", "extensions", "agentico-notify.ts"), "utf8");
    assert.match(omp, /"agent_end"/);
    const grok = JSON.parse(readFileSync(join(home, ".grok", "hooks", "agentico-notify.json"), "utf8"));
    assert.equal(grok.hooks.Stop.length, 1);

    applyProgramHooks({ env: {}, home, ctx, uninstall: true });
    assert.equal(existsSync(join(home, ".pi", "agent", "extensions", "agentico-notify.ts")), false);
    assert.equal(readFileSync(own, "utf8"), "{}");
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

  test("installs only for the programs found, and removes all of it", () => {
    const env = { CODEX_HOME: join(home, "codex"), HERMES_HOME: join(home, "hermes") };
    mkdirSync(env.CODEX_HOME);
    mkdirSync(env.HERMES_HOME);
    const ctx = { node: "/n", hook: "/h/program-hook.js" };
    const none = join(home, "none");
    assert.deepEqual(applyProgramHooks({ env, home: none, ctx }), ["codex", "hermes"]);
    const hooks = JSON.parse(readFileSync(join(env.CODEX_HOME, "hooks.json"), "utf8")).hooks;
    assert.equal(hooks.PermissionRequest[0].hooks[0].command, "'/n' '/h/program-hook.js' codex");
    const python = readFileSync(join(env.HERMES_HOME, "plugins/agentico/__init__.py"), "utf8");
    assert.match(python, /"\/n", "\/h\/program-hook\.js", "hermes"/);
    applyProgramHooks({ env, home: none, ctx, uninstall: true });
    assert.deepEqual(JSON.parse(readFileSync(join(env.CODEX_HOME, "hooks.json"), "utf8")), {});
    assert.equal(existsSync(join(env.HERMES_HOME, "plugins/agentico")), false);
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

suite("install-program-hooks", () => {
  test("adds the hooks once and keeps the user's own", () => {
    const mine = { hooks: [{ type: "command", command: "say done" }] };
    const start = { model: "opus", hooks: { Stop: [mine], PreToolUse: [mine] } };
    const once = withHooks(start, COMMAND, GROUPS);
    assert.deepEqual(withHooks(once, COMMAND, GROUPS), once);
    assert.equal(once.model, "opus");
    assert.equal(once.hooks.Stop.length, 2);
    assert.deepEqual(once.hooks.Stop[0], mine);
    assert.equal(once.hooks.Notification[0].matcher, "permission_prompt");
    assert.equal(once.hooks.Stop[1].hooks[0].async, true);
  });

  test("uninstalling leaves the file as it was", () => {
    const mine = { hooks: [{ type: "command", command: "say done" }] };
    const start = { hooks: { Stop: [mine] } };
    assert.deepEqual(withoutHooks(withHooks(start, COMMAND, GROUPS)), start);
    assert.deepEqual(withoutHooks(withHooks({}, COMMAND, GROUPS)), {});
  });

  test("a settings file it cannot read is left alone", () => {
    const path = join(home, "settings.json");
    writeFileSync(path, "{ broken");
    const result = spawnSync(process.execPath, [INSTALL], {
      env: { ...process.env, CLAUDE_CONFIG_DIR: home, HOME: home },
    });
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(path, "utf8"), "{ broken");
  });

  test("writes the file a real Claude Code reads", () => {
    const result = spawnSync(process.execPath, [INSTALL], {
      env: { ...process.env, CLAUDE_CONFIG_DIR: home, HOME: home },
    });
    assert.equal(result.status, 0);
    const settings = JSON.parse(readFileSync(join(home, "settings.json"), "utf8"));
    assert.match(settings.hooks.Stop[0].hooks[0].command, /program-hook\.js' claude$/);
  });
});
