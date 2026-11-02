// Rules for the paths Chat sends to a Host (Swift RemoteFilePath, RemoteHostPath.isAbsolute).

import { utf8Length } from '../../hosts/text';

/** Absolute, at most 4096 bytes, no `.` or `..` components, no NUL or control characters. */
export function isAcceptablePath(path: string): boolean {
  if (!path.startsWith('/') || utf8Length(path) > 4096) return false;
  for (let i = 0; i < path.length; i += 1) {
    const code = path.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false;
  }
  return !path.split('/').some((part) => part === '.' || part === '..');
}

/** Joins components onto a directory with single separators. */
export function joinPath(directory: string, ...components: string[]): string {
  let path = directory;
  for (const component of components) {
    if (!path.endsWith('/')) path += '/';
    path += component;
  }
  return path;
}

/** A POSIX absolute path, a Windows drive root (`C:\` or `C:/`), or a UNC path. */
export function isAbsoluteHostPath(path: string): boolean {
  if (path.startsWith('/')) return !path.includes('\0');
  return /^[A-Za-z]:[\\/]/.test(path) || /^\\\\[^\\/?.][^\\/]*[\\/]/.test(path);
}

/** One path component made of letters, digits, `-` and `_`, at most 128 bytes. */
export function isSafeComponent(text: string): boolean {
  return text !== '' && utf8Length(text) <= 128 && /^[\p{L}\p{N}_-]+$/u.test(text);
}
