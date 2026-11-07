// What the installer leaves in each program's own configuration, and that it undoes all of it.

import { test, suite, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { applyProgramHooks, withHooks, withoutHooks } from "../src/install-program-hooks.js";

const HOOK = fileURLToPath(new URL("../src/program-hook.js", import.meta.url));
const INSTALL = fileURLToPath(new URL("../src/install-program-hooks.js", import.meta.url));
const COMMAND = "'/n' '/x/program-hook.js' claude";
const GROUPS = { Notification: "permission_prompt", Stop: null };

let home;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "install-program-hooks-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

suite("the programs found", () => {
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
