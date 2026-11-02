import { looksSecret, RemotePath } from './path';
import type { FileEntry, RemoteFileKind } from './ports';

/** One row of the file browser: a Host directory entry as SFTP listed it (a link stays a link). */
export interface FileBrowserItem {
  name: string;
  path: string;
  kind: RemoteFileKind | null;
  size: number | null;
  modifiedAt: number | null;
}

export const isDirectory = (item: FileBrowserItem) => item.kind === 'directory';
/** Dot-files are listed, dimmed. */
export const isHidden = (item: FileBrowserItem) => item.name.startsWith('.');
export const itemLooksSecret = (item: FileBrowserItem) => looksSecret(item.name);
/** The browser can send this name back to the Host: no control characters, no U+FFFD stand-ins. */
export const isNameUsable = (item: FileBrowserItem) =>
  !item.name.includes('�') && RemotePath.isAcceptable(item.path);

export function toItem(entry: FileEntry, directory: string): FileBrowserItem {
  return {
    name: entry.name,
    path: RemotePath.join(directory, entry.name),
    kind: entry.kind,
    size: entry.size,
    modifiedAt: entry.modifiedAt,
  };
}

/** Folders first, then names in natural order ("file2" before "file10"). */
export function sortItems(items: readonly FileBrowserItem[]): FileBrowserItem[] {
  return [...items].sort((a, b) => {
    if (isDirectory(a) !== isDirectory(b)) return isDirectory(a) ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
}
