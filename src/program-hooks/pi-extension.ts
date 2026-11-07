// Installed by OpenAgentsPocket: forwards this Agent's asks and ends of turn to its notify hook.
import { spawn } from "node:child_process";

const forward = (input) => {
  const child = spawn("__NODE__", ["__HOOK__", "__PROGRAM__"], {
    stdio: ["pipe", "ignore", "ignore"],
    detached: true,
  });
  child.on("error", () => {});
  child.stdin.on("error", () => {});
  child.stdin.end(JSON.stringify(input));
  child.unref();
};

const sessionOf = (ctx) => {
  try {
    return ctx?.sessionManager?.getSessionId?.();
  } catch {
    return undefined;
  }
};

export default function (pi) {
  const send = (event, ctx, title) => {
    // Print and RPC runs have no pane and nobody waiting on a phone.
    if (ctx?.mode !== undefined && ctx.mode !== "tui") return;
    forward({ event, session_id: sessionOf(ctx), cwd: ctx?.cwd ?? process.cwd(), title });
  };
  pi.on("session_start", (_event, ctx) => send("session_start", ctx));
  pi.on("agent_start", (_event, ctx) => send("agent_start", ctx));
  pi.on("tool_approval_requested", (event, ctx) =>
    send("tool_approval_requested", ctx, event?.reason || event?.toolName),
  );
  pi.on("__DONE_EVENT__", (_event, ctx) => {
    if (ctx?.isIdle?.() !== false) send("done", ctx);
  });
}
