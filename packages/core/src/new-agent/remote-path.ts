import { isQuotableAbsolutePath } from '../hosts/herdr-endpoint';

// Swift RemoteHostPath: path rules for a directory the user picks on a Host, which may be POSIX
// or Windows (drive root or UNC share). Plain string work; the Host, not this device, sets them.

interface WindowsRoot {
  /** Index just past the root (`C:\`, or `\\server\share`). */
  readonly end: number;
  readonly separator: string;
}

const isWindowsSeparator = (char: string | undefined) => char === '/' || char === '\\';

function windowsRoot(path: string): WindowsRoot | undefined {
  if (/^[A-Za-z]:[\\/]/.test(path)) return { end: 3, separator: path.charAt(2) };
  // UNC paths stop at the share root. Device namespaces (`\\?\`, `\\.\`) are excluded, so Back
  // cannot turn a filesystem path into a device path.
  if (!path.startsWith('\\\\')) return undefined;
  let serverEnd = -1;
  for (let index = 2; index < path.length; index += 1) {
    if (isWindowsSeparator(path.charAt(index))) {
      serverEnd = index;
      break;
    }
  }
  if (serverEnd <= 2) return undefined;
  const server = path.slice(2, serverEnd);
  if (server === '.' || server === '..' || server === '?') return undefined;
  const rest = path.slice(serverEnd + 1);
  const shareLength = [...rest].findIndex(isWindowsSeparator);
  const share = shareLength < 0 ? rest : rest.slice(0, shareLength);
  if (share === '' || share === '.' || share === '..') return undefined;
  return { end: serverEnd + 1 + share.length, separator: '\\' };
}

function isSafeWindowsPath(path: string): boolean {
  for (const char of path) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f || code === 0x27 || code === 0x22) return false;
  }
  return true;
}

function trimSeparators(path: string, from: number, windows: boolean): string {
  let end = path.length;
  while (end > from) {
    const previous = path.charAt(end - 1);
    if (previous !== '/' && !(windows && previous === '\\')) break;
    end -= 1;
  }
  return path.slice(0, end);
}

export const RemoteHostPath = {
  /** A POSIX path the login shell can take as one word, or a safe Windows drive/UNC path. */
  isAbsolute(path: string): boolean {
    return windowsRoot(path) ? isSafeWindowsPath(path) : isQuotableAbsolutePath(path);
  },

  isWindowsAbsolute(path: string): boolean {
    return windowsRoot(path) !== undefined && isSafeWindowsPath(path);
  },

  childPath(parent: string, name: string): string {
    const root = windowsRoot(parent);
    const last = parent.charAt(parent.length - 1);
    if (last === '/' || (root !== undefined && last === '\\')) return parent + name;
    return `${parent}${root?.separator ?? '/'}${name}`;
  },

  /** The folder holding `path`; undefined at a filesystem root or for a path that is not absolute. */
  parentPath(path: string): string | undefined {
    if (!RemoteHostPath.isAbsolute(path)) return undefined;
    const root = windowsRoot(path);
    if (!root) {
      const trimmed = trimSeparators(path, 1, false);
      if (trimmed === '/' || trimmed === '') return undefined;
      const slash = trimmed.lastIndexOf('/');
      return slash <= 0 ? '/' : trimmed.slice(0, slash);
    }
    const trimmed = trimSeparators(path, root.end, true);
    if (trimmed.length <= root.end) return undefined;
    let separator = -1;
    for (let index = trimmed.length - 1; index >= 0; index -= 1) {
      if (isWindowsSeparator(trimmed.charAt(index))) {
        separator = index;
        break;
      }
    }
    if (separator < 0) return undefined;
    return path.slice(0, Math.max(separator, root.end));
  },

  /** A folder label that follows the Host's separators; roots keep their useful name. */
  lastComponent(path: string): string {
    const root = windowsRoot(path);
    const rootEnd = root?.end ?? (path.startsWith('/') ? 1 : 0);
    const trimmed = trimSeparators(path, rootEnd, root !== undefined);
    if (trimmed.length === rootEnd) return trimmed;
    const parts = trimmed.split(root ? /[\\/]/ : '/').filter((part) => part !== '');
    return parts[parts.length - 1] ?? path;
  },
};
