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
// In a tmux pane a Blocked push also leaves the ask the Live Activity answers
// (src/approval-ask-records.js), and the next status clears it. tmux runs one
// session, so the runtime's state directory is the session's.
// A failure never reaches the Agent: this always exits 0.

import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

import { forgetApprovalAsk, recordApprovalAsk } from "./approval-ask-records.js";
import { approvalFieldsFromRead, visibleScreenArgs } from "./approval-fields.js";
import { forDisplay, optionalText } from "./display-text.js";
import { readNotificationConfig } from "./notification-config.js";
import { deliverToDevices, readEligibleDevices } from "./notify-delivery.js";
import { PANE_LIST_FORMAT, paneInDirectory, writePaneRecord } from "./pane-records.js";
import { readUsageRuntime } from "./usage-runtime.js";

/** Past this the push goes out without approval fields. The hook runs apart from the Agent. */
const SCREEN_READ_TIMEOUT_MS = 5_000;

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

/** The screen's approval fields through the tmux bridge's launcher; null keeps a plain push. */
function readApproval(launcher, paneId, timestamp) {
  if (!launcher || !optionalText(paneId)) return null;
  const read = spawnSync(launcher, visibleScreenArgs(paneId), {
    encoding: "utf8",
    timeout: SCREEN_READ_TIMEOUT_MS,
  });
  return read.status === 0 ? approvalFieldsFromRead(read.stdout, paneId, timestamp) : null;
}

/** The pane of a hook that runs outside it, from what tmux shows; null when it cannot tell. */
function paneFromTmux(program, directory, env) {
  if (optionalText(directory) === null) return null;
  const socket = optionalText(env.OAP_TMUX_SOCKET);
  const args = [...(socket ? ["-L", socket] : []), "list-panes", "-a", "-F", PANE_LIST_FORMAT];
  const listed = spawnSync("tmux", args, { encoding: "utf8", timeout: SCREEN_READ_TIMEOUT_MS });
  return listed.status === 0 ? paneInDirectory(listed.stdout, program, directory) : null;
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
  const tmuxPane =
    optionalText(process.env.TMUX_PANE) ??
    (program === "opencode" ? paneFromTmux(program, input.cwd, process.env) : null);
  const paneId = tmuxPane ?? hookPaneId(process.env, input);
  const configDir = configDirOf(process.env);
  const status = activityOf(input, event);
  if (tmuxPane) {
    writePaneRecord(configDir, tmuxPane, {
      agent: program,
      session: optionalText(input.session_id ?? input.sessionID),
      status,
    });
  }
  const runtime = readUsageRuntime(configDir);
  // Only a pane has a screen to answer on; without a runtime there is nowhere to keep an ask.
  const askDir = tmuxPane ? runtime?.stateDir : null;
  if (askDir && status !== null && status !== "blocked") forgetApprovalAsk(askDir, tmuxPane);
  if (event === null || paneId === null) return;
  const devices = readEligibleDevices(configDir, event.status, "");
  if (devices.length === 0) {
    // No device takes this push, so none answers from an older ask.
    if (askDir && event.status === "blocked") forgetApprovalAsk(askDir, tmuxPane);
    return;
  }
  const cwd = optionalText(input.cwd);
  const timestamp = Math.floor(Date.now() / 1000);
  const approval = devices.some((device) => device.approve)
    ? readApproval(runtime?.herdr, tmuxPane, timestamp)
    : null;
  if (askDir && event.status === "blocked") recordApprovalAsk(askDir, tmuxPane, timestamp, approval);
  const { failures } = await deliverToDevices({
    configDir,
    config: readNotificationConfig(configDir),
    devices,
    approval,
    payload: {
      paneId,
      agentKind: program,
      status: event.status,
      timestamp,
      project: forDisplay(cwd === null ? null : basename(cwd)),
      title: forDisplay(event.title),
    },
  });
  for (const failure of failures) console.error(`program-hook: ${failure}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => console.error(`program-hook: ${error.message}`));
}
