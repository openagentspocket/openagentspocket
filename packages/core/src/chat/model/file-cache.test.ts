import '../programs';
// The file-backed cache rules (Swift ChatTranscriptCacheTests): round trip, undecodable and
// mismatched documents, Host removal, 30-day expiry, LRU eviction, oversize trimming, leftovers.

import { describe, expect, it } from 'vitest';
import {
  type ChatCacheDocument,
  type ChatCacheKey,
  cacheStorageName,
  DEFAULT_CACHE_POLICY,
  VolatileChatTranscriptCache,
} from './cache';
import { DAY, documentFor, fixture, HOST_A, HOST_B, keyFor } from './cache-fixtures.testkit';
import { hostDirectoryName } from './file-cache';

describe('FileChatTranscriptCache documents', () => {
  it('loads back what was saved, whole', async () => {
    const { cache } = fixture();
    const document = {
      ...documentFor(keyFor()),
      turns: [
        { firstEntryID: 'e0', startedAt: '2026-11-02T00:00:00.000Z', endedAt: null, ending: null },
      ],
    };
    expect(await cache.load(keyFor())).toEqual({ type: 'miss' });
    await cache.save(document as unknown as ChatCacheDocument);
    const loaded = await cache.load(keyFor());
    expect(loaded.type).toBe('hit');
    if (loaded.type === 'hit') expect(loaded.document).toEqual(document);
  });

  it('drops an undecodable document and a document filed under another key', async () => {
    const { cache, files, path } = fixture();
    await cache.save(documentFor(keyFor()));
    const stored = path(keyFor());
    expect(stored).toBeDefined();
    await files.write(stored ?? '', 'not json');
    expect(await cache.load(keyFor())).toEqual({ type: 'miss' });
    expect(files.paths()).toEqual([]);

    const other = keyFor(HOST_A, '01a10f87-e025-7fb1-8974-8dd09937767a');
    await cache.save(documentFor(keyFor()));
    const text = (await files.read(path(keyFor()) ?? '')) ?? '';
    await files.write(
      `/cache/v1/${hostDirectoryName(HOST_A)}/${cacheStorageName(other)}.json`,
      text,
    );
    expect(await cache.load(other)).toEqual({ type: 'miss' });
  });

  it('keeps a document it cannot read now, reporting it unavailable', async () => {
    const { cache, files, path } = fixture();
    await cache.save(documentFor(keyFor()));
    const stored = path(keyFor()) ?? '';
    files.unreadable.add(stored);
    expect(await cache.load(keyFor())).toEqual({ type: 'unavailable' });
    files.unreadable.clear();
    expect((await cache.load(keyFor())).type).toBe('hit');
  });

  it('file names reveal no identifiers', async () => {
    const { cache, files } = fixture();
    await cache.save(documentFor(keyFor()));
    for (const path of files.paths()) expect(path).not.toContain('claude');
    expect(files.paths()[0]).toMatch(/^\/cache\/v1\/[0-9a-f-]{36}\/[0-9a-f]{64}\.json$/);
  });

  it('a non-UUID Host id still gets a safe directory name', async () => {
    const { cache, files } = fixture();
    await cache.save(documentFor(keyFor('../weird id')));
    expect(files.paths()[0]).toMatch(/^\/cache\/v1\/h-[0-9a-f]{64}\/[0-9a-f]{64}\.json$/);
    expect((await cache.load(keyFor('../weird id'))).type).toBe('hit');
  });

  it('removing a Host deletes its documents and refuses late saves', async () => {
    const { cache, files } = fixture();
    await cache.save(documentFor(keyFor(HOST_A)));
    await cache.save(documentFor(keyFor(HOST_B)));
    await cache.retainHosts(new Set([HOST_B]));
    await cache.save(documentFor(keyFor(HOST_A)));
    expect(await cache.load(keyFor(HOST_A))).toEqual({ type: 'miss' });
    expect((await cache.load(keyFor(HOST_B))).type).toBe('hit');
    expect(files.paths().every((p) => p.includes(HOST_B))).toBe(true);
  });

  it('clearing removes everything', async () => {
    const { cache } = fixture();
    await cache.save(documentFor(keyFor()));
    expect(await cache.diskUsage()).toBeGreaterThan(0);
    await cache.removeAll();
    expect(await cache.diskUsage()).toBe(0);
    expect(await cache.load(keyFor())).toEqual({ type: 'miss' });
  });

  it('documents expire after thirty days, and reading refreshes them', async () => {
    const { cache, clock } = fixture();
    await cache.save(documentFor(keyFor()));
    clock.now += 29 * DAY;
    await cache.prune();
    expect((await cache.load(keyFor())).type).toBe('hit');
    clock.now += 31 * DAY;
    await cache.prune();
    expect(await cache.load(keyFor())).toEqual({ type: 'miss' });
  });

  it('over budget evicts the least recently used', async () => {
    const probe = fixture();
    await probe.cache.save(documentFor(keyFor()));
    const size =
      probe.files.paths().length === 1
        ? ((await probe.files.list(`/cache/v1/${hostDirectoryName(HOST_A)}`))[0]?.size ?? 0)
        : 0;
    const { cache, files, clock, path } = fixture({
      ...DEFAULT_CACHE_POLICY,
      totalBudget: size * 3 + size / 2,
      lowWater: size * 2 + size / 2,
    });
    const keys = [0, 1, 2, 3].map((n) => keyFor(HOST_A, `0000000${n}-0000-4000-8000-000000000000`));
    for (const [index, key] of keys.slice(0, 3).entries()) {
      await cache.save(documentFor(key));
      files.setModified(path(key) ?? '', clock.now + (index - 10) * 1000);
    }
    expect(files.paths()).toHaveLength(3);
    await cache.load(keys[0] as ChatCacheKey);
    await cache.save(documentFor(keys[3] as ChatCacheKey));
    expect(await cache.load(keys[1] as ChatCacheKey)).toEqual({ type: 'miss' });
    expect((await cache.load(keys[0] as ChatCacheKey)).type).toBe('hit');
    expect((await cache.load(keys[3] as ChatCacheKey)).type).toBe('hit');
  });

  it('an oversized document keeps its newest entries', async () => {
    const full = documentFor(keyFor(), 200, 'w'.repeat(200));
    const probe = fixture();
    await probe.cache.save(full);
    const fullSize =
      (await probe.files.list(`/cache/v1/${hostDirectoryName(HOST_A)}`))[0]?.size ?? 0;
    const { cache } = fixture({
      ...DEFAULT_CACHE_POLICY,
      maxDocumentBytes: Math.floor(fullSize / 2),
    });
    await cache.save(full);
    const loaded = await cache.load(keyFor());
    expect(loaded.type).toBe('hit');
    if (loaded.type !== 'hit') return;
    expect(loaded.document.entries.length).toBeLessThan(200);
    expect(loaded.document.entries.at(-1)).toEqual(full.entries.at(-1));
    expect(loaded.document.reachedStart).toBe(false);
    expect(loaded.document.coverageStart).toBe(loaded.document.entries[0]?.sourceOffset);
  });

  it('prunes leftovers outside the current version and unknown directories', async () => {
    const { cache, files } = fixture();
    await files.write('/cache/v0/old.json', '{}');
    await files.write('/cache/v1/not-a-host/x.json', '{}');
    await cache.prune();
    expect(files.paths()).toEqual([]);
  });

  it('operations are applied in order even when started together', async () => {
    const { cache } = fixture();
    await Promise.all([
      cache.save(documentFor(keyFor())),
      cache.remove(keyFor()),
      cache.save(documentFor(keyFor(), 5)),
    ]);
    const loaded = await cache.load(keyFor());
    expect(loaded.type === 'hit' && loaded.document.entries.length).toBe(5);
  });
});

describe('Volatile cache Host rule', () => {
  it('refuses late saves after a Host is removed', async () => {
    const cache = new VolatileChatTranscriptCache();
    await cache.save(documentFor(keyFor(HOST_A)));
    await cache.retainHosts(new Set([HOST_B]));
    await cache.save(documentFor(keyFor(HOST_A)));
    expect(await cache.load(keyFor(HOST_A))).toEqual({ type: 'miss' });
    await cache.save(documentFor(keyFor(HOST_B)));
    expect((await cache.load(keyFor(HOST_B))).type).toBe('hit');
  });
});
