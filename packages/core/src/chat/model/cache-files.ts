// The storage port under the file-backed Chat cache. The cache decides what to keep; a platform
// adapter (Expo file system on the phone, memory in tests) only reads and writes named files.

import { encodeUtf8 } from '../../events/utf8';

export interface CacheFileEntry {
  readonly name: string;
  readonly isDirectory: boolean;
  /** Bytes; 0 for a directory. */
  readonly size: number;
  /** Milliseconds since the epoch. */
  readonly modifiedMs: number;
}

/**
 * Paths are `/`-joined strings under a root the adapter owns. A missing path is a normal answer
 * (`null`, `[]`); anything else (a locked device, a full disk) rejects.
 */
export interface CacheFileStore {
  /** The file's text, or null when there is no such file. */
  read(path: string): Promise<string | null>;
  /** Replaces the file whole (never a torn write), creating parent directories. */
  write(path: string, text: string): Promise<void>;
  /** Deletes a file or a directory tree; a missing path is fine. */
  remove(path: string): Promise<void>;
  /** The directory's children, `[]` when it does not exist. */
  list(path: string): Promise<CacheFileEntry[]>;
  /** Marks the file as just used, for least-recently-used pruning. */
  touch(path: string): Promise<void>;
}

interface MemoryNode {
  text: string;
  modifiedMs: number;
}

/** UTF-8 byte length, which is what a file on disk occupies. */
export function textBytes(text: string): number {
  return encodeUtf8(text).length;
}

/** A store that lives in memory; its clock and failures are scripted by tests. */
export class MemoryCacheFileStore implements CacheFileStore {
  private readonly files = new Map<string, MemoryNode>();
  /** Paths whose reads reject, as on a device that is locked. */
  readonly unreadable = new Set<string>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  async read(path: string): Promise<string | null> {
    if (this.unreadable.has(path)) throw new Error('unreadable');
    return this.files.get(path)?.text ?? null;
  }

  async write(path: string, text: string): Promise<void> {
    this.files.set(path, { text, modifiedMs: this.now() });
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
    const prefix = `${path}/`;
    for (const name of [...this.files.keys()]) if (name.startsWith(prefix)) this.files.delete(name);
  }

  async list(path: string): Promise<CacheFileEntry[]> {
    const prefix = `${path}/`;
    const children = new Map<string, CacheFileEntry>();
    for (const [name, node] of this.files) {
      if (!name.startsWith(prefix)) continue;
      const rest = name.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash < 0) {
        children.set(rest, {
          name: rest,
          isDirectory: false,
          size: textBytes(node.text),
          modifiedMs: node.modifiedMs,
        });
      } else {
        const directory = rest.slice(0, slash);
        children.set(directory, { name: directory, isDirectory: true, size: 0, modifiedMs: 0 });
      }
    }
    return [...children.values()];
  }

  async touch(path: string): Promise<void> {
    const node = this.files.get(path);
    if (node) node.modifiedMs = this.now();
  }

  /** Test hook: back-dates a file. */
  setModified(path: string, modifiedMs: number): void {
    const node = this.files.get(path);
    if (node) node.modifiedMs = modifiedMs;
  }

  paths(): string[] {
    return [...this.files.keys()].sort();
  }
}
