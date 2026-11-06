#!/usr/bin/env node
// Adds to, or removes from, each installed program's own configuration what
// runs src/program-hook.js. Everything else stays as it was, and a settings
// file that cannot be read as JSON is left alone: it is the user's.
//
//   node install-program-hooks.js [--uninstall]
//
// Each program has its own mechanism; a new one is one entry in PROGRAMS.

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MARKER = /program-hook\.js'? (claude|codex)/;
const PLUGIN_ID = "agentico";

/** Async: a push may take seconds, and the Agent must never wait for it. */
const hookEntry = (command) => ({ type: "command", command, async: true });

const isOurs = (group) => group?.hooks?.some((hook) => MARKER.test(hook?.command ?? "")) ?? false;

export function withoutHooks(settings) {
  const hooks = { ...settings.hooks };
  for (const event of Object.keys(hooks)) {
    if (!Array.isArray(hooks[event])) continue;
    hooks[event] = hooks[event].filter((group) => !isOurs(group));
    if (hooks[event].length === 0) delete hooks[event];
  }
  const { hooks: _, ...rest } = settings;
  return Object.keys(hooks).length > 0 ? { ...rest, hooks } : rest;
}

/** `settings` with exactly one copy of our hooks: `groups` maps an event to its matcher, if any. */
export function withHooks(settings, command, groups) {
  const clean = withoutHooks(settings);
  const hooks = { ...clean.hooks };
  for (const [event, matcher] of Object.entries(groups)) {
    const group = { ...(matcher ? { matcher } : {}), hooks: [hookEntry(command)] };
    hooks[event] = [...(hooks[event] ?? []), group];
  }
  return { ...clean, hooks };
}

function readSettings(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
  const settings = JSON.parse(text);
  if (settings === null || typeof settings !== "object" || Array.isArray(settings)) {
    throw new Error(`${path} is not a settings object`);
  }
  return settings;
}

function write(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, text);
  renameSync(temp, path);
}

const writeJson = (path, value) => write(path, `${JSON.stringify(value, null, 2)}\n`);

/** A program configured by a JSON file of Claude-shaped hooks. */
const jsonHooks = (file, groups, program) => ({
  install: (ctx, root) => {
    const path = join(root, file);
    writeJson(path, withHooks(readSettings(path), `'${ctx.node}' '${ctx.hook}' ${program}`, groups));
  },
  uninstall: (_ctx, root) => {
    const path = join(root, file);
    if (existsSync(path)) writeJson(path, withoutHooks(readSettings(path)));
  },
});

const fill = (template, ctx) =>
  template.replaceAll("__NODE__", ctx.node).replaceAll("__HOOK__", ctx.hook);

const template = (name) =>
  readFileSync(fileURLToPath(new URL(`./program-hooks/${name}`, import.meta.url)), "utf8");

/** What keeps a pane's record current: its session, and that the Agent is working. */
const LIFECYCLE = { SessionStart: null, UserPromptSubmit: null, PostToolUse: null };

/** Where each program lives, and how it takes hooks. A program not installed is skipped. */
const PROGRAMS = {
  claude: {
    root: (env, home) => env.CLAUDE_CONFIG_DIR || join(home, ".claude"),
    // `permission_prompt` waits until nobody is typing, which is when a phone should ring.
    ...jsonHooks("settings.json", { ...LIFECYCLE, Notification: "permission_prompt", Stop: null }, "claude"),
  },
  codex: {
    root: (env, home) => env.CODEX_HOME || join(home, ".codex"),
    ...jsonHooks("hooks.json", { ...LIFECYCLE, PermissionRequest: null, Stop: null }, "codex"),
  },
  opencode: {
    root: (env, home) => join(env.XDG_CONFIG_HOME || join(home, ".config"), "opencode"),
    install: (ctx, root) =>
      write(join(root, "plugins", `${PLUGIN_ID}-notify.js`), fill(template("opencode-plugin.js"), ctx)),
    uninstall: (_ctx, root) => rmSync(join(root, "plugins", `${PLUGIN_ID}-notify.js`), { force: true }),
  },
  hermes: {
    root: (env, home) => env.HERMES_HOME || join(home, ".hermes"),
    install: (ctx, root) => {
      const dir = join(root, "plugins", PLUGIN_ID);
      write(join(dir, "plugin.yaml"), template("hermes-plugin.yaml"));
      write(join(dir, "__init__.py"), fill(template("hermes-plugin.py"), ctx));
    },
    uninstall: (_ctx, root) => rmSync(join(root, "plugins", PLUGIN_ID), { recursive: true, force: true }),
  },
};

/** Installs or removes for every program found; returns the ones it touched. */
export function applyProgramHooks({ env, home, ctx, uninstall = false }) {
  const touched = [];
  for (const [name, program] of Object.entries(PROGRAMS)) {
    const root = program.root(env, home);
    if (!existsSync(root)) continue;
    (uninstall ? program.uninstall : program.install)(ctx, root);
    touched.push(name);
  }
  return touched;
}

function main() {
  const ctx = {
    node: process.execPath,
    hook: fileURLToPath(new URL("./program-hook.js", import.meta.url)),
  };
  const uninstall = process.argv.includes("--uninstall");
  const touched = applyProgramHooks({ env: process.env, home: homedir(), ctx, uninstall });
  console.log(`${uninstall ? "Removed from" : "Installed in"}: ${touched.join(", ") || "nothing"}`);
  if (!uninstall && touched.includes("hermes")) console.log("Hermes: run `hermes plugins enable agentico`.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
