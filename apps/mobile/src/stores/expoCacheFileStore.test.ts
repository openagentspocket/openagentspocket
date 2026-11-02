import { KnownHostsStore, makeCacheDocument } from '@openagentspocket/core';
import { createChatTranscriptCache, createExpoCacheFileStore } from './expoCacheFileStore';

// A small in-memory stand-in for expo-file-system's File and Directory, keyed by uri.
const mockDisk = new Map<string, { text: string; modified: number }>();
const mockDirs = new Set<string>();

jest.mock('expo-file-system', () => {
  const nameOf = (uri: string) => uri.slice(uri.lastIndexOf('/') + 1);
  class MockFile {
    readonly uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get name() {
      return nameOf(this.uri);
    }
    get exists() {
      return mockDisk.has(this.uri);
    }
    get size() {
      return mockDisk.get(this.uri)?.text.length ?? 0;
    }
    get modificationTime() {
      return mockDisk.get(this.uri)?.modified ?? null;
    }
    create() {
      mockDisk.set(this.uri, { text: '', modified: Date.now() });
    }
    async write(text: string) {
      mockDisk.set(this.uri, { text, modified: Date.now() });
    }
    async text() {
      return mockDisk.get(this.uri)?.text ?? '';
    }
    delete() {
      mockDisk.delete(this.uri);
    }
    move(destination: MockFile) {
      const node = mockDisk.get(this.uri);
      if (node) mockDisk.set(destination.uri, node);
      mockDisk.delete(this.uri);
    }
  }
  class MockDirectory {
    readonly uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get name() {
      return nameOf(this.uri);
    }
    get exists() {
      return mockDirs.has(this.uri);
    }
    create() {
      let path = this.uri;
      while (path.includes('/')) {
        mockDirs.add(path);
        path = path.slice(0, path.lastIndexOf('/'));
      }
    }
    delete() {
      for (const uri of [...mockDisk.keys()])
        if (uri.startsWith(`${this.uri}/`)) mockDisk.delete(uri);
      for (const uri of [...mockDirs])
        if (uri === this.uri || uri.startsWith(`${this.uri}/`)) mockDirs.delete(uri);
    }
    list() {
      const prefix = `${this.uri}/`;
      const files = [...mockDisk.keys()]
        .filter((uri) => uri.startsWith(prefix) && !uri.slice(prefix.length).includes('/'))
        .map((uri) => new MockFile(uri));
      const dirs = [...mockDirs]
        .filter((uri) => uri.startsWith(prefix) && !uri.slice(prefix.length).includes('/'))
        .map((uri) => new MockDirectory(uri));
      return [...dirs, ...files];
    }
  }
  return { File: MockFile, Directory: MockDirectory, Paths: { cache: { uri: 'file:///cache/' } } };
});

beforeEach(() => {
  mockDisk.clear();
  mockDirs.clear();
});

describe('expo cache file store', () => {
  it('writes through a temporary file, lists sizes and dates, and removes trees', async () => {
    const store = createExpoCacheFileStore();
    await store.write('file:///cache/root/v1/h/a.json', '{"a":1}');
    expect([...mockDisk.keys()]).toEqual(['file:///cache/root/v1/h/a.json']);
    expect(await store.read('file:///cache/root/v1/h/a.json')).toBe('{"a":1}');
    expect(await store.read('file:///cache/root/v1/h/missing.json')).toBeNull();

    const [entry] = await store.list('file:///cache/root/v1/h');
    expect(entry).toMatchObject({ name: 'a.json', isDirectory: false, size: 7 });
    expect(await store.list('file:///cache/root/v1')).toMatchObject([
      { name: 'h', isDirectory: true },
    ]);
    expect(await store.list('file:///cache/nothing')).toEqual([]);

    await store.remove('file:///cache/root');
    expect(mockDisk.size).toBe(0);
    await store.remove('file:///cache/root');
  });

  it('touch rewrites the file so its date moves', async () => {
    const store = createExpoCacheFileStore();
    await store.write('file:///cache/root/v1/h/a.json', 'x');
    const node = mockDisk.get('file:///cache/root/v1/h/a.json');
    if (node) node.modified = 5;
    await store.touch('file:///cache/root/v1/h/a.json');
    expect(mockDisk.get('file:///cache/root/v1/h/a.json')?.modified).toBeGreaterThan(5);
  });

  it('backs the Chat cache under the platform cache directory', async () => {
    const cache = createChatTranscriptCache(new KnownHostsStore());
    const key = {
      hostID: 'h1',
      herdrSession: '',
      program: 'claude' as const,
      conversationID: 's1',
    };
    await cache.save(
      makeCacheDocument({
        key,
        adapterRevision: 1,
        transcriptPath: '/t.jsonl',
        head: new Uint8Array([1]),
        coverageStart: 0,
        coverageEnd: 0,
        reachedStart: true,
        title: null,
        entries: [],
        savedAt: '2026-11-02T00:00:00.000Z',
      }),
    );
    expect(
      [...mockDisk.keys()].every((uri) => uri.startsWith('file:///cache/AgenticoChatCache/v1/')),
    ).toBe(true);
    expect((await cache.load(key)).type).toBe('hit');
  });
});
