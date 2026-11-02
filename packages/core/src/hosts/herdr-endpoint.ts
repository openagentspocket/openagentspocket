import { trimSpaces, utf8Length } from './text';

/** The grammar herdr enforces for named sessions (checked at herdr 0.7.4). */
export const HERDR_SESSION_NAME_MAX_UTF8_LENGTH = 64;
const SESSION_NAME = /^[0-9A-Za-z._-]+$/;

/** 1-64 bytes of ASCII letters, digits, `.`, `_`, `-`; never `.` or `..`. */
export function isValidHerdrSessionName(name: string): boolean {
  if (name === '' || name === '.' || name === '..') return false;
  return name.length <= HERDR_SESSION_NAME_MAX_UTF8_LENGTH && SESSION_NAME.test(name);
}

/**
 * Absolute and quotable as one remote shell word in POSIX shells and fish:
 * no `'`, `\`, DEL or ASCII control characters. Spaces are fine.
 */
export function isQuotableAbsolutePath(path: string): boolean {
  if (!path.startsWith('/')) return false;
  for (const char of path) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f || code === 0x27 || code === 0x5c) return false;
  }
  return true;
}

/**
 * The session a hook whose `HERDR_SOCKET_PATH` is `socketPath` reports, as the
 * plugin's `sessionFromSocketPath` does: unset or empty is the default session
 * `''`; `.../herdr/sessions/<name>/herdr.sock` with a valid name is `<name>`,
 * checked first so a session named `herdr` is not read as the default;
 * `.../herdr/herdr.sock` is `''`; any other shape is unknown (null).
 */
export function sessionFromSocketPath(socketPath: string | null | undefined): string | null {
  if (!socketPath) return '';
  const suffix = '/herdr.sock';
  if (socketPath.endsWith(suffix)) {
    const directory = socketPath.slice(0, -suffix.length);
    const slash = directory.lastIndexOf('/');
    if (slash >= 0) {
      const name = directory.slice(slash + 1);
      if (directory.slice(0, slash).endsWith('/herdr/sessions') && isValidHerdrSessionName(name)) {
        return name;
      }
    }
  }
  return socketPath.endsWith('/herdr/herdr.sock') ? '' : null;
}

/**
 * A herdr instance a Host runs outside the user's own config home, carried by
 * a Pairing Code v2. Build it with `makeHerdrEndpoint` so it always satisfies
 * the v2 rules.
 */
export interface HerdrEndpoint {
  /** Absolute path of the herdr API socket, in herdr's own layout. */
  readonly socketPath: string;
  /** Absolute path of an executable that behaves as `herdr` for this endpoint. */
  readonly executablePath: string;
}

/**
 * The longest socket path every supported Host can bind: macOS `sun_path` holds
 * 104 bytes with the NUL, and herdr's `-client` sibling must fit too.
 */
export const HERDR_SOCKET_PATH_MAX_UTF8_LENGTH = 96;

/** null when either path breaks the v2 rules. */
export function makeHerdrEndpoint(
  socketPath: string,
  executablePath: string,
): HerdrEndpoint | null {
  if (!isQuotableAbsolutePath(socketPath) || !isQuotableAbsolutePath(executablePath)) return null;
  if (utf8Length(socketPath) > HERDR_SOCKET_PATH_MAX_UTF8_LENGTH) return null;
  if (sessionFromSocketPath(socketPath) === null) return null;
  return { socketPath, executablePath };
}

/** Re-validates an endpoint read from storage or the wire; null when it breaks the rules. */
export function decodeHerdrEndpoint(value: unknown): HerdrEndpoint | null {
  if (typeof value !== 'object' || value === null) return null;
  const { socketPath, executablePath } = value as Record<string, unknown>;
  if (typeof socketPath !== 'string' || typeof executablePath !== 'string') return null;
  return makeHerdrEndpoint(socketPath, executablePath);
}

/** Where the herdr API socket lives on a Host. */
export type HerdrSocketLocation =
  | { readonly kind: 'defaultSession' }
  | { readonly kind: 'namedSession'; readonly name: string }
  | { readonly kind: 'absolutePath'; readonly path: string };

/** The socket a Host targets: its endpoint's when it has one, else its session's. */
export function socketLocationFor(
  sessionName: string,
  endpoint: HerdrEndpoint | null,
): HerdrSocketLocation {
  if (endpoint) return { kind: 'absolutePath', path: endpoint.socketPath };
  const name = trimSpaces(sessionName);
  return name === '' ? { kind: 'defaultSession' } : { kind: 'namedSession', name };
}

/** The absolute socket path, given the Host's home directory. */
export function socketPath(location: HerdrSocketLocation, homeDirectory: string): string {
  const home = homeDirectory.endsWith('/') ? homeDirectory.slice(0, -1) : homeDirectory;
  switch (location.kind) {
    case 'defaultSession':
      return `${home}/.config/herdr/herdr.sock`;
    case 'namedSession':
      return `${home}/.config/herdr/sessions/${location.name}/herdr.sock`;
    case 'absolutePath':
      return location.path;
  }
}
