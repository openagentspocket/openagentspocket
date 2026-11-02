// An in-memory Host filesystem for tests of the follower, the locator and the engine.

import { encodeUtf8 } from '../../events/utf8';
import type {
  ChatHostFiles,
  HostFileListing,
  HostFileListingRequest,
  HostFileRange,
  HostFileSlice,
  HostFileStatus,
} from './host-files';

interface FakeFile {
  data: Uint8Array;
  modificationTime: number;
}

export class FakeHostFiles implements ChatHostFiles {
  private readonly files = new Map<string, FakeFile>();
  private readonly directories = new Set<string>();
  homePath = '/home/user';
  readCount = 0;
  /** Paths whose reads and stats throw, to simulate an unreadable file. */
  failing = new Set<string>();

  write(path: string, content: string | Uint8Array, modificationTime = 1): void {
    const data = typeof content === 'string' ? encodeUtf8(content) : content;
    this.files.set(path, { data, modificationTime });
    this.addParents(path);
  }

  append(path: string, content: string, modificationTime = 2): void {
    const old = this.files.get(path)?.data ?? new Uint8Array(0);
    const add = encodeUtf8(content);
    const data = new Uint8Array(old.length + add.length);
    data.set(old, 0);
    data.set(add, old.length);
    this.files.set(path, { data, modificationTime });
  }

  remove(path: string): void {
    this.files.delete(path);
  }

  mkdir(path: string): void {
    this.directories.add(path);
    this.addParents(path);
  }

  private addParents(path: string): void {
    const parts = path.split('/');
    for (let i = 2; i < parts.length; i += 1) this.directories.add(parts.slice(0, i).join('/'));
  }

  async status(path: string): Promise<HostFileStatus | null> {
    if (this.failing.has(path)) throw new Error('unreadable');
    const file = this.files.get(path);
    if (file)
      return { size: file.data.length, modificationTime: file.modificationTime, kind: 'regular' };
    if (this.directories.has(path))
      return { size: null, modificationTime: null, kind: 'directory' };
    return null;
  }

  async list(request: HostFileListingRequest): Promise<HostFileListing | null> {
    if (!this.directories.has(request.directory)) return null;
    const prefix = request.directory.endsWith('/') ? request.directory : `${request.directory}/`;
    const names = new Set<string>();
    for (const path of [...this.directories, ...this.files.keys()]) {
      if (!path.startsWith(prefix) || path === request.directory) continue;
      const name = path.slice(prefix.length).split('/')[0] as string;
      const isDirectory = this.directories.has(prefix + name);
      if (
        isDirectory &&
        request.kinds.includes('directory') &&
        name.startsWith(request.namePrefix ?? '')
      ) {
        names.add(name);
      }
    }
    const sorted = [...names].sort();
    return {
      entries: sorted.slice(0, request.maximumEntries).map((name) => ({ name })),
      truncated: sorted.length > request.maximumEntries,
      scanIncomplete: false,
    };
  }

  async read(range: HostFileRange): Promise<HostFileSlice> {
    this.readCount += 1;
    if (this.failing.has(range.path)) throw new Error('unreadable');
    const file = this.files.get(range.path);
    if (!file) return { data: new Uint8Array(0), length: null };
    return {
      data: file.data.slice(range.offset, range.offset + range.maxBytes),
      length: file.data.length,
    };
  }

  async home(): Promise<string> {
    return this.homePath;
  }
}
