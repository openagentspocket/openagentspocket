import { utf8Length } from './bytes';

/**
 * A herdr instance a Host runs outside the user's own config home, carried
 * by a Pairing Code v2. Only `herdrEndpoint()` builds one, so a value always
 * satisfies the v2 rules.
 */
export interface HerdrEndpoint {
  /** Absolute path of herdr's API socket, in herdr's own layout. */
  readonly socketPath: string;
  /** Absolute path of an executable that behaves as `herdr` for this endpoint. */
  readonly executablePath: string;
}

/**
 * The longest socket path every supported Host can bind and connect: the
 * `-client` sibling must fit macOS `sun_path` (104 bytes with the NUL).
 */
export const MAXIMUM_SOCKET_PATH_UTF8_LENGTH = 96;

const MAXIMUM_SESSION_NAME_UTF8_LENGTH = 64;

/** The grammar herdr enforces for named sessions: `[0-9A-Za-z._-]`, 1..64 bytes, not `.`/`..`. */
export function isValidHerdrSessionName(name: string): boolean {
  if (name === '' || name === '.' || name === '..') return false;
  if (utf8Length(name) > MAXIMUM_SESSION_NAME_UTF8_LENGTH) return false;
  return /^[0-9A-Za-z._-]+$/.test(name);
}

/**
 * Absolute and quotable as one remote shell word: no `'`, `\`, DEL or ASCII
 * control characters. Spaces are fine.
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
 * The session a hook whose socket is `socketPath` reports: `''` for the
 * default session (`…/herdr/herdr.sock`), the name for
 * `…/herdr/sessions/<name>/herdr.sock` (checked first, so a session named
 * `herdr` is not read as the default), null for any other shape.
 */
export function herdrSessionFromSocketPath(socketPath: string | null | undefined): string | null {
  if (!socketPath) return '';
  const socketSuffix = '/herdr.sock';
  if (socketPath.endsWith(socketSuffix)) {
    const directory = socketPath.slice(0, -socketSuffix.length);
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

/** A validated endpoint, or null when either path breaks the v2 rules. */
export function herdrEndpoint(socketPath: string, executablePath: string): HerdrEndpoint | null {
  if (!isQuotableAbsolutePath(socketPath) || !isQuotableAbsolutePath(executablePath)) return null;
  if (utf8Length(socketPath) > MAXIMUM_SOCKET_PATH_UTF8_LENGTH) return null;
  if (herdrSessionFromSocketPath(socketPath) === null) return null;
  return { socketPath, executablePath };
}

export function sameHerdrEndpoint(a: HerdrEndpoint | null, b: HerdrEndpoint | null): boolean {
  if (a === null || b === null) return a === b;
  return a.socketPath === b.socketPath && a.executablePath === b.executablePath;
}
