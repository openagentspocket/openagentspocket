import { message, type Text } from '../errors/text';
import { encodeUtf8 } from '../events/utf8';

export const MAX_NAME_UTF8_BYTES = 255;
const MAX_PATH_UTF8_BYTES = 4096;

const utf8Length = (value: string) => encodeUtf8(value).length;
const hasControl = (value: string) => [...value].some((c) => c < ' ' || c === '\u007f');

/** Absolute POSIX paths on a Host. Plain string work: a quote or backslash in a name is fine. */
export const RemotePath = {
  /** Absolute, bounded, no control characters, no `.` or `..` component. */
  isAcceptable(path: string): boolean {
    if (!path.startsWith('/') || utf8Length(path) > MAX_PATH_UTF8_BYTES || hasControl(path)) {
      return false;
    }
    return !path.split('/').some((part) => part === '.' || part === '..');
  },

  join(directory: string, ...components: string[]): string {
    let path = directory;
    for (const component of components) {
      if (!path.endsWith('/')) path += '/';
      path += component;
    }
    return path;
  },

  /** The folder holding `path`, null for `/`. */
  parent(path: string): string | null {
    let trimmed = path;
    while (trimmed.length > 1 && trimmed.endsWith('/')) trimmed = trimmed.slice(0, -1);
    if (!trimmed.startsWith('/') || trimmed === '/') return null;
    const slash = trimmed.lastIndexOf('/');
    return slash === 0 ? '/' : trimmed.slice(0, slash);
  },

  lastComponent(path: string): string {
    let trimmed = path;
    while (trimmed.length > 1 && trimmed.endsWith('/')) trimmed = trimmed.slice(0, -1);
    if (trimmed === '/') return '/';
    return trimmed.slice(trimmed.lastIndexOf('/') + 1);
  },

  /** `/` and the folders directly in it: renaming one can keep the Host from booting. */
  isSystemPath(path: string): boolean {
    return path === '/' || RemotePath.parent(path) === '/';
  },
};

/** Why `name` cannot name an item, or null when it can. One path component, at most NAME_MAX bytes. */
export function nameProblem(name: string): Text | null {
  if (name.trim() === '') return message('Enter a name.');
  if (name === '.' || name === '..') return message('"%@" is not a usable name.', name);
  if (name.includes('/')) return message('A name cannot contain "/".');
  if (hasControl(name)) return message('A name cannot contain control characters.');
  if (utf8Length(name) > MAX_NAME_UTF8_BYTES) return message('That name is too long.');
  return null;
}

function splitExtension(name: string): [string, string] {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return [name, ''];
  return [name.slice(0, dot), name.slice(dot)];
}

/**
 * "report 2.pdf", "report 3.pdf", ...: the first variant not in `taken`. The suffix goes before
 * the last extension; a leading dot is part of the stem, so ".env" becomes ".env 2".
 */
export function keepingBoth(name: string, taken: ReadonlySet<string>): string {
  const [stem, suffix] = splitExtension(name);
  for (let index = 2; ; index++) {
    const candidate = `${stem} ${index}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Names that often hold credentials. Downloading or sharing one asks first: the Device Key already
 * reaches them, so this is a nudge against sharing by accident, not a lock.
 */
export function looksSecret(name: string): boolean {
  const lowered = name.toLowerCase();
  if (lowered === '.env' || lowered.startsWith('.env.')) return true;
  if (lowered.startsWith('id_') || lowered.startsWith('credentials')) return true;
  if (['.pem', '.key', '.p12', '.pfx'].some((suffix) => lowered.endsWith(suffix))) return true;
  return ['.ssh', '.aws', '.gnupg', '.netrc', '.pgpass'].includes(lowered);
}

/** A file extension that is safe to keep on a local copy: short, lowercase ASCII alphanumerics. */
export function safeExtension(candidate: string): string {
  const lowered = candidate.toLowerCase();
  return /^[0-9a-z]{1,16}$/.test(lowered) ? lowered : '';
}
