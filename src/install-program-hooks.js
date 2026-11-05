#!/usr/bin/env node
// Adds to, or removes from, a program's settings the hooks that run
// src/program-hook.js. Everything else in the file stays as it was, and a file
// that cannot be read as JSON is left alone: it is the user's.
//
//   node install-program-hooks.js [--uninstall]

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MARKER = /program-hook\.js'? claude/;

/** Async: a push may take seconds, and the Agent must never wait for it. */
const hookEntry = (command) => ({ type: "command", command, async: true });

const isOurs = (group) => group?.hooks?.some((hook) => MARKER.test(hook?.command ?? "")) ?? false;

function without(settings) {
  const hooks = { ...settings.hooks };
  for (const event of ["Notification", "Stop"]) {
    if (!Array.isArray(hooks[event])) continue;
    hooks[event] = hooks[event].filter((group) => !isOurs(group));
    if (hooks[event].length === 0) delete hooks[event];
  }
  const { hooks: _, ...rest } = settings;
  return Object.keys(hooks).length > 0 ? { ...rest, hooks } : rest;
}

/** `settings` with exactly one copy of our hooks. */
export function withClaudeHooks(settings, command) {
  const clean = without(settings);
  const hooks = clean.hooks ?? {};
  return {
    ...clean,
    hooks: {
      ...hooks,
      Notification: [
        ...(hooks.Notification ?? []),
        { matcher: "permission_prompt", hooks: [hookEntry(command)] },
      ],
      Stop: [...(hooks.Stop ?? []), { hooks: [hookEntry(command)] }],
    },
  };
}

export const withoutClaudeHooks = without;

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

function main() {
  const path = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "settings.json");
  const script = fileURLToPath(new URL("./program-hook.js", import.meta.url));
  const settings = readSettings(path);
  const next = process.argv.includes("--uninstall")
    ? withoutClaudeHooks(settings)
    : withClaudeHooks(settings, `node '${script}' claude`);
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(temp, path);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
