#!/usr/bin/env node
// Agent Notifications from a program's own hooks (ADR 0027), for Hosts where
// no multiplexer reports Agent status: tmux knows nothing about Agents, but
// the Agent does. The program runs this script with its hook JSON on stdin:
//
//   node program-hook.js claude < hook.json
//
// A hook event is exact, unlike herdr's heuristic status, so there is no
// debounce and no dedupe: every event is a real ask or a real end of turn, and
// the collapse key lets a newer push replace an older one for the same pane.
// A failure never reaches the Agent: this always exits 0.

import { homedir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

import { forDisplay, optionalText } from "./display-text.js";
import { readNotificationConfig } from "./notification-config.js";
import { deliverToDevices, readEligibleDevices } from "./notify-delivery.js";
import { writePaneRecord } from "./pane-records.js";

/**
 * Claude Code's hook input. `permission_prompt` fires once nobody has typed
 * for a few seconds, which is when a phone should ring; `idle_prompt` only
 * repeats a turn that `Stop` already reported.
 *
 * @returns {{status: "blocked" | "done", title: string | null} | null}
 */
export function parseClaudeHook(input) {
  if (input?.hook_event_name === "Notification" && input.notification_type === "permission_prompt") {
    return { status: "blocked", title: optionalText(input.message) };
  }
  // A Stop a hook already continued is not the end of the turn.
  if (input?.hook_event_name === "Stop" && input.stop_hook_active !== true) {
    return { status: "done", title: null };
  }
  return null;
}

/**
 * Codex's hooks have Claude Code's shape, but `PermissionRequest` is its only signal of an ask.
 *
 * @returns {{status: "blocked" | "done", title: string | null} | null}
 */
export function parseCodexHook(input) {
  if (input?.hook_event_name === "PermissionRequest") {
    return { status: "blocked", title: optionalText(input.tool_name) };
  }
  if (input?.hook_event_name === "Stop" && input.stop_hook_active !== true) {
    return { status: "done", title: null };
  }
  return null;
}

/** What the OpenCode plugin forwards (src/program-hooks/opencode-plugin.js): its event's type. */
export function parseOpenCodeHook(input) {
  if (input?.event === "permission.asked") {
    return { status: "blocked", title: optionalText(input.title) };
  }
  return input?.event === "session.idle" ? { status: "done", title: null } : null;
}

/** What the Hermes plugin forwards: the name of the hook that fired. */
export function parseHermesHook(input) {
  if (input?.event === "pre_approval_request") {
    return { status: "blocked", title: optionalText(input.description ?? input.command) };
  }
  return input?.event === "post_llm_call" ? { status: "done", title: null } : null;
}

/** What Pi's and omp's extension forwards (src/program-hooks/pi-extension.ts). */
export function parsePiHook(input) {
  if (input?.event === "tool_approval_requested") {
    return { status: "blocked", title: optionalText(input.title) };
  }
  return input?.event === "done" ? { status: "done", title: null } : null;
}

/** Grok Build's hooks have Claude Code's events with camelCase fields; `Notification` is its ask. */
export function parseGrokHook(input) {
  if (input?.hook_event_name === "Notification") {
    return { status: "blocked", title: optionalText(input.message) };
  }
  return input?.hook_event_name === "Stop" ? { status: "done", title: null } : null;
}

/** Grok names its fields in camelCase; everything after this reads one shape. */
export function normalizedInput(program, input) {
  if (program !== "grok") return input;
  return { ...input, hook_event_name: input?.hookEventName, session_id: input?.sessionId };
}

/** The status a hook shows beyond what notifies: tmux has no other way to know it. */
export function activityOf(input, event) {
  if (event) return event.status;
  if (input?.hook_event_name === "SessionStart" || input?.event === "session_start") return "idle";
  if (input?.event === "agent_start") return "working";
  const working = ["UserPromptSubmit", "PostToolUse"];
  return working.includes(input?.hook_event_name) ? "working" : null;
}

const PARSERS = {
  claude: parseClaudeHook,
  codex: parseCodexHook,
  opencode: parseOpenCodeHook,
  hermes: parseHermesHook,
  pi: parsePiHook,
  omp: parsePiHook,
  grok: parseGrokHook,
};

/** The pane the Agent runs in, or its own session where no multiplexer holds it. */
export function hookPaneId(env, input) {
  return optionalText(env.TMUX_PANE) ?? optionalText(input?.session_id ?? input?.sessionID);
}

/** Inside herdr its status events already notify: a second push would repeat them. */
export function herdrOwnsThisPane(env) {
  return Boolean(env.HERDR_ENV || env.HERDR_SOCKET_PATH);
}

/** Where a Host without herdr keeps the registration and `notify.json`. */
export function configDirOf(env) {
  return env.OAP_CONFIG_DIR || join(homedir(), ".config", "openagentspocket");
}

async function readStdin() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

async function main() {
  const program = process.argv[2];
  const input = normalizedInput(program, JSON.parse(await readStdin()));
  if (!Object.hasOwn(PARSERS, program) || herdrOwnsThisPane(process.env)) return;
  const event = PARSERS[program](input);
  const paneId = hookPaneId(process.env, input);
  const configDir = configDirOf(process.env);
  if (optionalText(process.env.TMUX_PANE)) {
    writePaneRecord(configDir, process.env.TMUX_PANE, {
      agent: program,
      session: optionalText(input.session_id ?? input.sessionID),
      status: activityOf(input, event),
    });
  }
  if (event === null || paneId === null) return;
  const devices = readEligibleDevices(configDir, event.status, "");
  if (devices.length === 0) return;
  const cwd = optionalText(input.cwd);
  const { failures } = await deliverToDevices({
    configDir,
    config: readNotificationConfig(configDir),
    // No approval fields yet: the Blocked push only says that it needs you.
    devices: devices.map((device) => ({ ...device, approve: false })),
    payload: {
      paneId,
      agentKind: program,
      status: event.status,
      timestamp: Math.floor(Date.now() / 1000),
      project: forDisplay(cwd === null ? null : basename(cwd)),
      title: forDisplay(event.title),
    },
  });
  for (const failure of failures) console.error(`program-hook: ${failure}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => console.error(`program-hook: ${error.message}`));
}
