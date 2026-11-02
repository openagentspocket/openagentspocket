import type { HerdrEndpoint } from './herdr-endpoint';
import { isQuotableAbsolutePath } from './herdr-endpoint';

/** POSIX sh expansion of mise's shims directory (non-interactive shells never read `mise activate`). */
// biome-ignore lint/suspicious/noTemplateCurlyInString: a POSIX sh expansion, evaluated remotely
export const MISE_SHIMS = '${MISE_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/mise}/shims';

/**
 * Directories prepended to `PATH` on herdr CLI and Agent discovery execs. `$HOME` and the
 * expansions are evaluated by the remote `/bin/sh`, not here.
 */
export const HERDR_EXTRA_PATH = `$HOME/.local/bin:${MISE_SHIMS}:$HOME/.linuxbrew/bin:$HOME/.cargo/bin:$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/home/linuxbrew/.linuxbrew/bin`;

/** `export PATH="...:$PATH"` for a remote script that calls a bare `herdr`. */
export const HERDR_PATH_EXPORT = `export PATH="${HERDR_EXTRA_PATH}:$PATH"`;

/** The path as one single-quoted shell word, or null unless absolute and quotable. */
export function quotedAbsolutePath(path: string): string | null {
  return isQuotableAbsolutePath(path) ? `'${path}'` : null;
}

/**
 * The pieces of a remote script that must call the Host's herdr: the environment line and the
 * command. A paired endpoint names its launcher and socket by absolute path and carries no PATH.
 */
export function herdrScriptCommand(
  endpoint: HerdrEndpoint | null,
  args: string,
): { environment: string; command: string } {
  const executable = endpoint ? quotedAbsolutePath(endpoint.executablePath) : null;
  const socket = endpoint ? quotedAbsolutePath(endpoint.socketPath) : null;
  if (executable && socket) {
    return { environment: `export HERDR_SOCKET_PATH=${socket}`, command: `${executable} ${args}` };
  }
  return { environment: HERDR_PATH_EXPORT, command: `herdr ${args}` };
}
