import {
  HERDR_PATH_EXPORT,
  type HerdrEndpoint,
  quotedAbsolutePath,
  type TransportError,
} from '@openagentspocket/core';

/** Forces the C locale so a Host's translated output never reaches a parser. */
export function cLocale(command: string): string {
  return `LC_ALL=C ${command}`;
}

/** The first 200 characters of Host output, for an error detail. */
export function preview(text: string): string {
  return text.slice(0, 200);
}

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/**
 * True when `command` invokes an unpathed `herdr` as its command word. Leading `NAME=value`
 * assignments are skipped; quoted literals and absolute paths stay false.
 */
export function isBareHerdrCommand(command: string): boolean {
  const word = command
    .trim()
    .split(/\s+/)
    .find((candidate) => candidate !== '' && !ASSIGNMENT.test(candidate));
  return word === 'herdr';
}

/**
 * Wraps a still-bare `herdr ...` in `/bin/sh` so the extra PATH prefixes are visible even under
 * fish, whose `$PATH` is a list. Other commands are returned unchanged.
 */
export function wrappingBareHerdr(command: string): string {
  if (!isBareHerdrCommand(command)) return command;
  return `/bin/sh -c '${HERDR_PATH_EXPORT}; exec ${command.replaceAll("'", "'\\''")}'`;
}

/**
 * Exit 127 from a still-bare `herdr` is the PATH miss. With an endpoint launcher, 126 or 127
 * means the launcher is missing or could not start herdr, whatever the command word.
 */
export function missingBinaryError(
  exitCode: number,
  command: string,
  endpoint: HerdrEndpoint | null,
): TransportError | null {
  if (endpoint) {
    if (exitCode !== 126 && exitCode !== 127) return null;
    return { kind: 'herdrLauncherNotFound', path: endpoint.executablePath };
  }
  return exitCode === 127 && isBareHerdrCommand(command) ? { kind: 'herdrBinaryNotFound' } : null;
}

/**
 * `herdr <arguments>` run through an endpoint's launcher (`$1`) with its socket (`$2`). `prelude`
 * is sh text ending in `; ` that runs first. Null when either path cannot be quoted.
 */
export function launcherCommand(
  endpoint: HerdrEndpoint,
  args: string,
  prelude = '',
): string | null {
  const executable = quotedAbsolutePath(endpoint.executablePath);
  const socket = quotedAbsolutePath(endpoint.socketPath);
  if (!executable || !socket) return null;
  return `/bin/sh -c 'export HERDR_SOCKET_PATH="$2"; ${prelude}exec "$1" ${args}' herdr ${executable} ${socket}`;
}
