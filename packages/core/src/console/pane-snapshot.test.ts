import { describe, expect, it, vi } from 'vitest';
import { PaneSnapshotCache, snapshotLines } from './pane-snapshot';

describe('snapshotLines', () => {
  it('keeps the last lines with content, cut to the width, without trailing blanks', () => {
    const text = ['one', 'two', 'three', 'four  ', '', '   ', ''].join('\n');
    expect(snapshotLines(text, 3, 4)).toEqual(['two', 'thre', 'four']);
  });
  it('is empty for a blank screen', () => {
    expect(snapshotLines('\n \n', 5, 10)).toEqual([]);
  });
});

function cacheWith(read: (host: string, pane: string) => Promise<string>, clock: { now: number }) {
  return new PaneSnapshotCache({ read, now: () => clock.now, ttlMs: 1000, maxEntries: 2 });
}

describe('PaneSnapshotCache', () => {
  it('serves a fresh snapshot without reading again and rereads after the ttl', async () => {
    const clock = { now: 0 };
    const read = vi.fn(async () => 'hello');
    const cache = cacheWith(read, clock);
    cache.request('h', 'p');
    await vi.waitFor(() => expect(cache.get('h', 'p')).toEqual(['hello']));
    cache.request('h', 'p');
    expect(read).toHaveBeenCalledTimes(1);
    clock.now = 1500;
    cache.request('h', 'p');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('reads one pane at a time and keeps the old snapshot when a read fails', async () => {
    const clock = { now: 0 };
    let fail = false;
    const read = vi.fn(async () => {
      if (fail) throw new Error('offline');
      return 'kept';
    });
    const cache = cacheWith(read, clock);
    cache.request('h', 'p');
    cache.request('h', 'p');
    await vi.waitFor(() => expect(cache.get('h', 'p')).toEqual(['kept']));
    expect(read).toHaveBeenCalledTimes(1);
    fail = true;
    clock.now = 5000;
    cache.request('h', 'p');
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(cache.get('h', 'p')).toEqual(['kept']);
  });

  it('notifies only when the text changed and drops the least recently used entry', async () => {
    const clock = { now: 0 };
    let text = 'a';
    const cache = cacheWith(async () => text, clock);
    const listener = vi.fn();
    cache.subscribe(listener);
    cache.request('h', '1');
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    clock.now = 2000;
    cache.request('h', '1');
    await vi.waitFor(() => expect(cache.get('h', '1')).toBeDefined());
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(listener).toHaveBeenCalledTimes(1);
    text = 'b';
    cache.request('h', '2');
    cache.request('h', '3');
    await vi.waitFor(() => expect(cache.get('h', '3')).toEqual(['b']));
    expect(cache.get('h', '1')).toBeUndefined();
  });
});
