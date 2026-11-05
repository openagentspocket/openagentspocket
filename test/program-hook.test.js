// Process-boundary tests: the hook runs as Claude Code runs it, a child process
// with its JSON on stdin, against a fake relay.

import { test, suite, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { withClaudeHooks, withoutClaudeHooks } from "../src/install-program-hooks.js";
import { herdrOwnsThisPane, hookPaneId, parseClaudeHook } from "../src/program-hook.js";

const HOOK = fileURLToPath(new URL("../src/program-hook.js", import.meta.url));
const INSTALL = fileURLToPath(new URL("../src/install-program-hooks.js", import.meta.url));
const KEY = Buffer.from(Array.from({ length: 32 }, (_, i) => i)).toString("base64url");
const COMMAND = "node '/x/program-hook.js' claude";

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
    const once = withClaudeHooks(start, COMMAND);
    assert.deepEqual(withClaudeHooks(once, COMMAND), once);
    assert.equal(once.model, "opus");
    assert.equal(once.hooks.Stop.length, 2);
    assert.deepEqual(once.hooks.Stop[0], mine);
    assert.equal(once.hooks.Notification[0].matcher, "permission_prompt");
    assert.equal(once.hooks.Stop[1].hooks[0].async, true);
  });

  test("uninstalling leaves the file as it was", () => {
    const mine = { hooks: [{ type: "command", command: "say done" }] };
    const start = { hooks: { Stop: [mine] } };
    assert.deepEqual(withoutClaudeHooks(withClaudeHooks(start, COMMAND)), start);
    assert.deepEqual(withoutClaudeHooks(withClaudeHooks({}, COMMAND)), {});
  });

  test("a settings file it cannot read is left alone", () => {
    const path = join(home, "settings.json");
    writeFileSync(path, "{ broken");
    const result = spawnSync(process.execPath, [INSTALL], {
      env: { ...process.env, CLAUDE_CONFIG_DIR: home },
    });
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(path, "utf8"), "{ broken");
  });

  test("writes the file a real Claude Code reads", () => {
    const result = spawnSync(process.execPath, [INSTALL], {
      env: { ...process.env, CLAUDE_CONFIG_DIR: home },
    });
    assert.equal(result.status, 0);
    const settings = JSON.parse(readFileSync(join(home, "settings.json"), "utf8"));
    assert.match(settings.hooks.Stop[0].hooks[0].command, /program-hook\.js' claude$/);
  });
});
