import '../programs';
// The cache document rules (Swift ChatTranscriptCacheTests): stripped entries, revision drop,
// Host retention, size cap, and the preview and file-change caps the cache depends on.

import { describe, expect, it } from 'vitest';
import { encodeUtf8 } from '../../events/utf8';
import {
  type ChatCacheKey,
  cacheStorageName,
  decodeCacheDocument,
  encodeCacheDocument,
  loadCurrent,
  makeCacheDocument,
  VolatileChatTranscriptCache,
} from './cache';
import { toolActivity } from './factories';
import { allAddedChange, capPreview, fileChangeFromHunks, relativeToDirectory } from './preview';
import { recordedEntries } from './transcript';
import type { ChatEntry } from './types';
import { emptyTranscript } from './types';

const key: ChatCacheKey = {
  hostID: 'AAAA-1',
  herdrSession: '',
  program: 'claude',
  conversationID: 's1',
};

const toolEntry = (n: number): ChatEntry => ({
  id: `tool:${n}`,
  sourceOffset: n * 100,
  content: {
    type: 'tool',
    value: toolActivity({
      kind: 'fileEdit',
      name: 'Edit',
      title: 'a.ts',
      status: 'succeeded',
      preview: { text: 'output', isTruncated: false, imageCount: 0 },
      cardAnswer: 'allowed',
      isNotUpdating: true,
      fileChanges: {
        files: [
          fileChangeFromHunks('a.ts', 'updated', [
            { oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a', '+b'] },
          ]),
        ],
        moreFiles: 0,
        directory: null,
        isShared: false,
        isUnavailable: false,
        isSkipped: false,
        movesWorkingTree: false,
      },
    }),
  },
});

const document = (entries: ChatEntry[], revision = 14) =>
  makeCacheDocument({
    key,
    adapterRevision: revision,
    transcriptPath: '/h/s.jsonl',
    head: encodeUtf8('{"a":1}'),
    coverageStart: 0,
    coverageEnd: 500,
    reachedStart: true,
    title: 'T',
    entries,
    savedAt: '2026-11-02T00:00:00.000Z',
  });

describe('cache document', () => {
  it('storage names are digests of the key, stable and distinct per field', () => {
    const name = cacheStorageName(key);
    expect(name).toMatch(/^[0-9a-f]{64}$/);
    expect(name).toBe(cacheStorageName({ ...key, hostID: 'aaaa-1' }));
    expect(name).not.toBe(cacheStorageName({ ...key, herdrSession: 'name:work' }));
    expect(name).not.toBe(cacheStorageName({ ...key, conversationID: 's2' }));
    expect(name).not.toContain('s1');
  });

  it('keeps entries without tool output, diff lines or card state', () => {
    const decoded = decodeCacheDocument(encodeCacheDocument(document([toolEntry(1)])));
    const content = decoded?.entries[0]?.content;
    if (content?.type !== 'tool') throw new Error('expected a tool entry');
    expect(content.value).toMatchObject({
      preview: null,
      cardAnswer: null,
      isNotUpdating: false,
      status: 'succeeded',
    });
    const file = content.value.fileChanges?.files[0];
    expect(file).toMatchObject({ path: 'a.ts', added: 1, removed: 1, hunks: [], isLineCut: false });
  });

  it('rejects text that is not a document of this format', () => {
    expect(decodeCacheDocument('not json')).toBeNull();
    expect(decodeCacheDocument('{"formatVersion":99}')).toBeNull();
  });

  it('a document over the byte cap keeps its newest entries and no longer reaches the start', () => {
    const entries = Array.from({ length: 40 }, (_, i) => toolEntry(i + 1));
    const text = encodeCacheDocument(document(entries), 6000);
    const decoded = decodeCacheDocument(text);
    expect(encodeUtf8(text).length).toBeLessThanOrEqual(6000);
    expect(decoded?.entries.at(-1)?.id).toBe('tool:40');
    expect(decoded?.entries.length).toBeLessThan(40);
    expect(decoded?.reachedStart).toBe(false);
    expect(decoded?.coverageStart).toBe(decoded?.entries[0]?.sourceOffset);
  });
});

describe('volatile cache', () => {
  it('round-trips, and a document from another adapter revision is dropped on load', async () => {
    const cache = new VolatileChatTranscriptCache();
    await cache.save(document([toolEntry(1)], 13));
    expect((await cache.load(key)).type).toBe('hit');
    expect(await loadCurrent(cache, key, 14)).toEqual({ type: 'miss' });
    expect(await cache.load(key)).toEqual({ type: 'miss' });
    await cache.save(document([toolEntry(1)], 14));
    expect((await loadCurrent(cache, key, 14)).type).toBe('hit');
  });

  it('retaining Hosts deletes the others and refuses their later saves', async () => {
    const cache = new VolatileChatTranscriptCache();
    await cache.save(document([]));
    await cache.retainHosts(new Set(['OTHER']));
    expect(await cache.load(key)).toEqual({ type: 'miss' });
    await cache.save(document([]));
    expect(await cache.load(key)).toEqual({ type: 'miss' });
  });
});

describe('recorded entries', () => {
  it('leave out the waiting bubbles', () => {
    const transcript = {
      ...emptyTranscript(),
      entries: [toolEntry(1), toolEntry(2)],
      unrecordedEntryIDs: new Set(['tool:2']),
    };
    expect(recordedEntries(transcript).map((entry) => entry.id)).toEqual(['tool:1']);
  });
});

describe('preview caps', () => {
  it('cuts at the line limit without the newline, flagging more text', () => {
    expect(capPreview('a\nb\nc\nd', 0, { lines: 2, bytes: 100 })).toEqual({
      text: 'a\nb',
      isTruncated: true,
      imageCount: 0,
    });
    expect(capPreview('a\nb\n', 0, { lines: 2, bytes: 100 })).toEqual({
      text: 'a\nb',
      isTruncated: false,
      imageCount: 0,
    });
    expect(capPreview('a\nb', 0, { lines: 2, bytes: 100 })).toEqual({
      text: 'a\nb',
      isTruncated: false,
      imageCount: 0,
    });
  });

  it('cuts at the byte limit between characters, counting UTF-8 bytes', () => {
    expect(capPreview('abécd', 0, { lines: 10, bytes: 3 })).toEqual({
      text: 'ab',
      isTruncated: true,
      imageCount: 0,
    });
    expect(capPreview('a\r\nb', 0, { lines: 10, bytes: 100 }).text).toBe('a\r\nb');
  });

  it('counts lines of created files and keeps the first ones within the limit', () => {
    const change = allAddedChange('n.txt', 'one\ntwo\nthree\n', 'created', {
      lines: 2,
      bytes: 1000,
    });
    expect(change).toMatchObject({ added: 3, lineCount: 3, removed: 0 });
    expect(change.hunks[0]?.lines).toEqual(['+one', '+two']);
  });

  it('shows paths relative to the call directory, also through /private aliases', () => {
    expect(relativeToDirectory('/work/p/src/a.ts', '/work/p')).toBe('src/a.ts');
    expect(relativeToDirectory('/private/tmp/x/a.ts', '/tmp/x')).toBe('a.ts');
    expect(relativeToDirectory('/other/a.ts', '/work/p')).toBe('/other/a.ts');
    expect(relativeToDirectory('/work/p/a.ts', null)).toBe('/work/p/a.ts');
  });
});
