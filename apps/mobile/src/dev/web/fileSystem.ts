/**
 * Web stand-in for `expo-file-system` (the atlas only): an in-memory tree with the slice of the
 * File/Directory API the app uses. Nothing persists; a missing path simply does not exist.
 */
import { utf8Decode, utf8Encode } from 'agentico-ssh';

type Entry = { dir: true } | { dir: false; data: Uint8Array; modified: number };

const tree = new Map<string, Entry>();
const join = (parts: unknown[]) =>
  parts
    .map((part) => (typeof part === 'string' ? part : (part as { uri: string }).uri))
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/(.)\/$/, '$1');

class Node {
  readonly uri: string;
  constructor(...parts: unknown[]) {
    this.uri = join(parts);
  }
  get name(): string {
    return this.uri.split('/').pop() ?? '';
  }
  get exists(): boolean {
    return tree.has(this.uri);
  }
  get parentDirectory(): Directory {
    return new Directory(this.uri.split('/').slice(0, -1).join('/'));
  }
  delete(): void {
    for (const key of [...tree.keys()])
      if (key === this.uri || key.startsWith(`${this.uri}/`)) tree.delete(key);
  }
}

export class Directory extends Node {
  create(): void {
    tree.set(this.uri, { dir: true });
  }
  list(): (File | Directory)[] {
    const prefix = `${this.uri}/`;
    return [...tree.entries()]
      .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
      .map(([key, entry]) => (entry.dir ? new Directory(key) : new File(key)));
  }
}

export class File extends Node {
  get size(): number {
    const entry = tree.get(this.uri);
    return entry && !entry.dir ? entry.data.length : 0;
  }
  get modificationTime(): number {
    const entry = tree.get(this.uri);
    return entry && !entry.dir ? entry.modified : 0;
  }
  create(): void {
    tree.set(this.uri, { dir: false, data: new Uint8Array(), modified: 0 });
  }
  async text(): Promise<string> {
    return utf8Decode(await this.bytes());
  }
  async bytes(): Promise<Uint8Array> {
    const entry = tree.get(this.uri);
    return entry && !entry.dir ? entry.data : new Uint8Array();
  }
  async write(text: string): Promise<void> {
    tree.set(this.uri, { dir: false, data: utf8Encode(text), modified: 0 });
  }
  move(target: File): void {
    const entry = tree.get(this.uri);
    if (entry) tree.set(target.uri, entry);
    tree.delete(this.uri);
  }
  async copy(target: File): Promise<void> {
    const entry = tree.get(this.uri);
    if (entry) tree.set(target.uri, entry);
  }
  open() {
    return { writeBytes: (_chunk: Uint8Array) => {}, close: () => {} };
  }
}

export const FileMode = { ReadOnly: 'r', WriteOnly: 'w', ReadWrite: 'rw' } as const;

export const Paths = { cache: new Directory('/cache') };
