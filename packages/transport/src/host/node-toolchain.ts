// biome-ignore-all lint/suspicious/noTemplateCurlyInString: POSIX sh expansions, evaluated remotely
import { HERDR_PATH_EXPORT } from '@openagentspocket/core';
import { isBareHerdrCommand } from './shell';

/**
 * Finds the Host's Node.js for a plugin install, whose `npm ci` build runs with the exec's
 * `PATH`. SSH exec reads no interactive shell setup, which is where most Node.js installs put
 * themselves, so the probe looks where each common install method keeps a default `node` and
 * `npm`: version managers first, then what `PATH` finds, then system package managers, and last
 * the login shell itself, bounded by a watchdog. A directory counts only when its `npm` runs and
 * the `node` it would start is at least `NODE_MINIMUM_MAJOR`. Without one the probe exits
 * `NODE_PROBE_FAILURE_EXIT` before herdr fetches anything, printing a marker.
 */

/** The plugin's `engines.node`. */
export const NODE_MINIMUM_MAJOR = 20;
export const NODE_MISSING_MARKER = '__AGENTICO_NODE_NOT_FOUND__';
export const NODE_TOO_OLD_MARKER = '__AGENTICO_NODE_TOO_OLD__=';
export const NPM_MISSING_MARKER = '__AGENTICO_NPM_NOT_FOUND__=';
export const NODE_PROBE_FAILURE_EXIT = 3;
/** How long the login shell may take to say where `npm` is. */
export const LOGIN_SHELL_SECONDS = 10;

/** Where the probe looks, for the failure message. */
export const NODE_SEARCHED_PLACES =
  'mise, Volta, fnm, nvm, asdf, nodenv, nvs, nodebrew, n, proto, pnpm, Homebrew, ' +
  'the SSH PATH, Nix, snap, MacPorts and the login shell';

/**
 * POSIX sh statements, each ending in `; `, free of single quotes so they fit inside a
 * single-quoted `/bin/sh -c` body. Variables use a `__h_` prefix to stay clear of the Host's
 * environment.
 */
export const NODE_PROBE_SCRIPT = [
  '__h_npm=',
  '__h_old=',
  '__h_try() { [ -z "$__h_npm" ] || return 0; [ -n "$1" ] && [ -x "$1/npm" ] || return 1; ' +
    '__h_p="$1${2:+:$2}"; ' +
    '__h_v=$(PATH="$__h_p:$PATH"; node -p process.versions.node </dev/null 2>/dev/null) ' +
    '|| return 1; ' +
    `if ! [ "\${__h_v%%.*}" -ge ${NODE_MINIMUM_MAJOR} ] 2>/dev/null; then ` +
    '[ -n "$__h_old" ] || __h_old="$__h_v"; return 1; fi; ' +
    'PATH="$__h_p:$PATH" "$1/npm" --version </dev/null >/dev/null 2>&1 || return 1; ' +
    '__h_npm="$__h_p"; }',
  '__h_data="${XDG_DATA_HOME:-$HOME/.local/share}"',
  '__h_try "${MISE_DATA_DIR:-$__h_data/mise}/shims"',
  '__h_try "${VOLTA_HOME:-$HOME/.volta}/bin"',
  'for __h_d in "$FNM_DIR" "$__h_data/fnm" "$HOME/Library/Application Support/fnm" ' +
    '"$HOME/.fnm"; do [ -n "$__h_d" ] && __h_try "$__h_d/aliases/default/bin"; done',
  '__h_nvm="${NVM_DIR:-$HOME/.nvm}"',
  'if [ -z "$__h_npm" ] && [ -s "$__h_nvm/nvm.sh" ]; then ' +
    '__h_node=$(NVM_DIR="$__h_nvm"; export NVM_DIR; . "$__h_nvm/nvm.sh" >/dev/null 2>&1; ' +
    'nvm which default 2>/dev/null </dev/null); ' +
    'case "$__h_node" in /*) __h_try "${__h_node%/*}";; esac; fi',
  'for __h_d in "$__h_nvm"/versions/node/v*/bin; do __h_try "$__h_d"; done',
  '__h_try "${ASDF_DATA_DIR:-$HOME/.asdf}/shims" "${ASDF_DIR:-$HOME/.asdf}/bin"',
  '__h_try "${NODENV_ROOT:-$HOME/.nodenv}/shims"',
  '__h_try "${NVS_HOME:-$HOME/.nvs}/default/bin"',
  '__h_try "$HOME/.nodebrew/current/bin"',
  '__h_try "${N_PREFIX:-$HOME/n}/bin"',
  '__h_try "${PROTO_HOME:-$HOME/.proto}/shims"',
  'for __h_d in "$PNPM_HOME" "$HOME/Library/pnpm" "$__h_data/pnpm"; do __h_try "$__h_d"; done',
  '__h_node=$(command -v npm 2>/dev/null) && __h_try "${__h_node%/*}"',
  'for __h_d in /opt/homebrew/bin /usr/local/bin /home/linuxbrew/.linuxbrew/bin ' +
    '/opt/homebrew/opt/node*/bin /usr/local/opt/node*/bin ' +
    '/home/linuxbrew/.linuxbrew/opt/node*/bin "$HOME/.nix-profile/bin" ' +
    '"/etc/profiles/per-user/$USER/bin" /run/current-system/sw/bin ' +
    '/nix/var/nix/profiles/default/bin /snap/bin /opt/local/bin; do __h_try "$__h_d"; done',
  'if [ -z "$__h_npm" ] && [ -n "$SHELL" ]; then case "${SHELL##*/}" in bash|zsh|fish|ksh) ' +
    '__h_f=$(mktemp 2>/dev/null) && { ' +
    '"$SHELL" -lic /usr/bin/env </dev/null >"$__h_f" 2>/dev/null & __h_s=$!; ' +
    `( sleep ${LOGIN_SHELL_SECONDS} & __h_z=$!; trap "kill $__h_z; exit" TERM; wait "$__h_z"; ` +
    'pkill -9 -P "$__h_s"; kill -9 "$__h_s" ) </dev/null >/dev/null 2>&1 & __h_w=$!; ' +
    '{ wait "$__h_s"; kill "$__h_w"; wait "$__h_w"; } 2>/dev/null; ' +
    '__h_lp=$(sed -n "s/^PATH=//p" "$__h_f" | tail -n 1 | tr -d "\\r"); rm -f "$__h_f"; ' +
    '__h_node=$(PATH="$__h_lp"; command -v npm 2>/dev/null); ' +
    'case "$__h_node" in /*) __h_try "${__h_node%/*}" "$__h_lp";; esac; }; ;; esac; fi',
  'if [ -z "$__h_npm" ]; then if [ -z "$__h_old" ]; then ' +
    '__h_v=$(PATH="${__h_lp:+$__h_lp:}$PATH"; node -p process.versions.node </dev/null 2>/dev/null); ' +
    `if [ "\${__h_v%%.*}" -ge ${NODE_MINIMUM_MAJOR} ] 2>/dev/null; then ` +
    `printf "%s%s\\n" ${NPM_MISSING_MARKER} "$__h_v" >&2; exit ${NODE_PROBE_FAILURE_EXIT}; fi; ` +
    '__h_old="$__h_v"; fi; ' +
    `if [ -n "$__h_old" ]; then printf "%s%s\\n" ${NODE_TOO_OLD_MARKER} "$__h_old" >&2; ` +
    `else printf "%s\\n" ${NODE_MISSING_MARKER} >&2; fi; exit ${NODE_PROBE_FAILURE_EXIT}; fi`,
  'PATH="$__h_npm:$PATH"; export PATH',
]
  .map((statement) => `${statement}; `)
  .join('');

/**
 * A bare `herdr ...` under `/bin/sh` with the PATH prefixes and the probe's directory first.
 * `herdr` is resolved before the probe changes `PATH`, so a `herdr` beside Node.js cannot replace
 * the one the app runs elsewhere; a missing one still exits 127.
 */
export function wrappingBareHerdrWithNode(command: string): string {
  if (!isBareHerdrCommand(command) || !command.startsWith('herdr')) return command;
  const args = command.slice('herdr'.length).replaceAll("'", "'\\''");
  return (
    `/bin/sh -c '${HERDR_PATH_EXPORT}; __h_herdr=$(command -v herdr) || exit 127; ` +
    `${NODE_PROBE_SCRIPT}exec "$__h_herdr"${args}'`
  );
}

/** Why a plugin install stopped before herdr ran. */
export type NodeToolchainProblem =
  | { readonly kind: 'missing' }
  | { readonly kind: 'tooOld'; readonly version: string }
  | { readonly kind: 'npmMissing'; readonly nodeVersion: string };

/** The probe's marker in what the step printed, only for the probe's own exit status. */
export function nodeToolchainProblem(
  exitCode: number,
  output: string,
): NodeToolchainProblem | null {
  if (exitCode !== NODE_PROBE_FAILURE_EXIT) return null;
  for (const line of output.split(/\r?\n|\r/)) {
    if (line === NODE_MISSING_MARKER) return { kind: 'missing' };
    if (line.startsWith(NODE_TOO_OLD_MARKER)) {
      return { kind: 'tooOld', version: line.slice(NODE_TOO_OLD_MARKER.length) };
    }
    if (line.startsWith(NPM_MISSING_MARKER)) {
      return { kind: 'npmMissing', nodeVersion: line.slice(NPM_MISSING_MARKER.length) };
    }
  }
  return null;
}
