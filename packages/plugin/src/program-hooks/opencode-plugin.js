// Installed by OpenAgentsPocket: forwards OpenCode's asks and ends of turn to its notify hook.
import { spawn } from "node:child_process";

const forward = (input) => {
  const child = spawn("__NODE__", ["__HOOK__", "opencode"], {
    stdio: ["pipe", "ignore", "ignore"],
    detached: true,
  });
  child.on("error", () => {});
  child.stdin.on("error", () => {});
  child.stdin.end(JSON.stringify(input));
  child.unref();
};

export const AgenticoNotify = async ({ directory }) => ({
  event: async ({ event }) => {
    if (event.type !== "session.idle" && event.type !== "permission.asked") return;
    const { sessionID, title } = event.properties ?? {};
    forward({ event: event.type, sessionID, title, cwd: directory });
  },
});
