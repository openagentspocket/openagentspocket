// Ported from Swift TranscriptFollowerTests (small limits so a few hundred bytes hit every boundary).

import { describe, expect, it } from 'vitest';
import { decodeUtf8, encodeUtf8 } from '../../events/utf8';
import { FakeHostFiles } from './fake-host-files';
import { TranscriptFollower } from './follower';
import { type ChatLine, frameLines } from './lines';

const PATH = '/home/dev/.claude/projects/-k/s.jsonl';
const LIMITS = {
  tailWindow: 64,
  readChunk: 16,
  pollBudget: 1024,
  olderPage: 32,
  maximumOlderPage: 128,
  lineStartSearch: 1024,
  anchorLength: 8,
  headLength: 32,
  lineCap: 4096,
  prefixCap: 16,
};

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);
const lines = (from: number, to: number) =>
  range(from, to)
    .map((n) => `{"n":${n}}\n`)
    .join('');
const expected = (from: number, to: number) => range(from, to).map((n) => `{"n":${n}}`);
const texts = (list: ChatLine[]) => list.map((line) => decodeUtf8(line.data));

async function open(text: string, limits: Partial<typeof LIMITS> = {}) {
  const files = new FakeHostFiles();
  files.write(PATH, text);
  const follower = new TranscriptFollower(PATH, { ...LIMITS, ...limits });
  const opened = await follower.open(files);
  if (!opened) throw new Error('did not open');
  return { follower, files, opened };
}

describe('opening', () => {
  it('a small file opens whole', async () => {
    const { follower, opened } = await open(lines(0, 4));
    expect(texts(opened)).toEqual(expected(0, 4));
    expect(follower.windowStart).toBe(0);
    expect(follower.hasOlder).toBe(false);
  });

  it('a large file opens at its tail without the cut line', async () => {
    const { follower, opened } = await open(lines(0, 30));
    const got = texts(opened);
    expect(got.at(-1)).toBe('{"n":29}');
    expect(expected(0, 30).slice(-got.length)).toEqual(got);
    expect(got.length).toBeLessThan(30);
    expect(follower.hasOlder).toBe(true);
    expect(follower.windowStart).toBe(opened[0]?.offset);
  });

  it('short reads give the same lines', async () => {
    const { opened: reference } = await open(lines(0, 30));
    const { opened } = await open(lines(0, 30), { readChunk: 5 });
    expect(opened).toEqual(reference);
  });
});

describe('polling', () => {
  it('an unchanged file costs one stat and no read', async () => {
    const { follower, files } = await open(lines(0, 4));
    files.readCount = 0;
    expect(await follower.poll(files)).toEqual({ type: 'unchanged' });
    expect(files.readCount).toBe(0);
  });

  it('appended lines arrive once complete', async () => {
    const { follower, files } = await open(lines(0, 4));
    files.append(PATH, '{"n":4}\n{"n":');
    const first = await follower.poll(files);
    expect(first).toEqual({
      type: 'appended',
      lines: [{ offset: 32, length: 7, data: encodeUtf8('{"n":4}') }],
    });
    files.append(PATH, '5}\n');
    const second = await follower.poll(files);
    expect(second.type === 'appended' && texts(second.lines)).toEqual(['{"n":5}']);
    expect(second.type === 'appended' && second.lines[0]?.offset).toBe(40);
  });

  it('short reads deliver the same appended lines', async () => {
    const { follower, files } = await open(lines(0, 30), { readChunk: 5 });
    files.append(PATH, lines(30, 33));
    const change = await follower.poll(files);
    expect(change).toEqual({
      type: 'appended',
      lines: frameLines(encodeUtf8(lines(30, 33)), {
        startOffset: encodeUtf8(lines(0, 30)).length,
      }),
    });
  });

  it('a touch without new bytes checks the anchor only', async () => {
    const { follower, files } = await open(lines(0, 4));
    files.write(PATH, lines(0, 4), 9);
    files.readCount = 0;
    expect(await follower.poll(files)).toEqual({ type: 'unchanged' });
    expect(files.readCount).toBe(1);
  });

  it('an in-place shrink reloads the tail keeping identity', async () => {
    const { follower, files } = await open(lines(0, 4));
    files.write(PATH, lines(0, 2));
    expect(await follower.poll(files)).toEqual({
      type: 'reset',
      lines: frameLines(encodeUtf8(lines(0, 2))),
      replaced: false,
    });
  });

  it('a different file under the same name is replaced', async () => {
    const { follower, files } = await open(lines(0, 4));
    files.write(PATH, lines(100, 108));
    const change = await follower.poll(files);
    expect(change.type === 'reset' && change.replaced).toBe(true);
    expect(change.type === 'reset' && texts(change.lines).at(-1)).toBe('{"n":107}');
  });

  it('a rewrite that grows the file fails the anchor', async () => {
    const { follower, files } = await open(lines(0, 4));
    files.write(PATH, lines(0, 3) + lines(50, 53));
    const change = await follower.poll(files);
    expect(change.type).toBe('reset');
  });

  it('a missing file keeps state and resumes when it returns', async () => {
    const { follower, files } = await open(lines(0, 4));
    files.remove(PATH);
    expect(await follower.poll(files)).toEqual({ type: 'missing' });
    files.write(PATH, lines(0, 5));
    const change = await follower.poll(files);
    expect(change).toEqual({
      type: 'appended',
      lines: [{ offset: 32, length: 7, data: encodeUtf8('{"n":4}') }],
    });
  });

  it('a failed read keeps the position', async () => {
    const { follower, files } = await open(lines(0, 4));
    files.append(PATH, lines(4, 6));
    files.failing.add(PATH);
    await expect(follower.poll(files)).rejects.toThrow();
    files.failing.clear();
    const change = await follower.poll(files);
    expect(change.type === 'appended' && texts(change.lines)).toEqual(expected(4, 6));
  });

  it('a title-slot rewrite is not a replacement when identity reads the same conversation', async () => {
    const files = new FakeHostFiles();
    const body = `{"id":"abc","title":"aaaa"}\n${lines(0, 4)}`;
    files.write(PATH, body);
    const identity = (head: Uint8Array) => /"id":"([^"]+)"/.exec(decodeUtf8(head))?.[1] ?? null;
    const follower = new TranscriptFollower(PATH, LIMITS, identity);
    await follower.open(files);
    files.write(PATH, `{"id":"abc","title":"bbbbbbbb"}\n${lines(0, 4)}`);
    const change = await follower.poll(files);
    expect(change.type === 'reset' && change.replaced).toBe(false);
  });
});

describe('older history', () => {
  it('paging backwards reaches the head with every line once', async () => {
    const text = lines(0, 40);
    const { follower, files, opened } = await open(text);
    let all = opened;
    let pages = 0;
    while (follower.hasOlder) {
      const page = await follower.loadOlder(files);
      if (page.type !== 'lines') throw new Error('expected an older page');
      all = [...page.lines, ...all];
      pages += 1;
    }
    expect(pages).toBeGreaterThan(1);
    expect(all).toEqual(frameLines(encodeUtf8(text)));
    expect(await follower.loadOlder(files)).toEqual({ type: 'headReached' });
  });

  it('a longer page reads further back, never past the largest', async () => {
    const { follower, files, opened } = await open(lines(0, 40));
    const end = opened[0]?.offset ?? 0;
    const page = await follower.loadOlder(files, 96);
    if (page.type !== 'lines') throw new Error('expected an older page');
    const start = page.lines[0]?.offset ?? 0;
    expect(end - start).toBeGreaterThan(64);
    expect(end - start).toBeLessThanOrEqual(96);
    const capped = await follower.loadOlder(files, 1000);
    if (capped.type !== 'lines') throw new Error('expected an older page');
    expect(start - (capped.lines[0]?.offset ?? 0)).toBeLessThanOrEqual(128);
  });

  it('a line longer than the largest page arrives truncated', async () => {
    const long = `{"blob":"${'z'.repeat(300)}"}`;
    const { follower, files, opened } = await open(`${lines(0, 2) + long}\n${lines(2, 4)}`);
    expect(texts(opened)).toEqual(expected(2, 4));
    const page = await follower.loadOlder(files);
    if (page.type !== 'lines') throw new Error('expected the long line');
    expect(page.lines).toHaveLength(1);
    const line = page.lines[0] as ChatLine;
    expect(line.offset).toBe(16);
    expect(line.length).toBe(long.length);
    expect(line.data.length).toBeLessThan(line.length);
    expect(decodeUtf8(line.data)).toBe(long.slice(0, 16));
    const head = await follower.loadOlder(files);
    expect(head.type === 'lines' && texts(head.lines)).toEqual(expected(0, 2));
    expect(follower.hasOlder).toBe(false);
  });

  it('a limited page leaves a longer line unread', async () => {
    const long = `{"blob":"${'z'.repeat(100)}"}`;
    const { follower, files } = await open(`${lines(0, 2) + long}\n${lines(2, 4)}`, {
      tailWindow: 24,
    });
    expect(await follower.loadOlder(files, null, 0)).toEqual({ type: 'beyondLimit' });
  });

  it('notices bytes changed before the window', async () => {
    const { follower, files } = await open(lines(0, 40));
    files.write(PATH, `${'#'.repeat(40)}\n${lines(1, 40)}`);
    const page = await follower.loadOlder(files);
    expect(['rewritten', 'lines']).toContain(page.type);
  });

  it('reads an output line by offset and length', async () => {
    const { follower, files } = await open(lines(0, 4));
    const line = await follower.line({ path: null, offset: 8, length: 7 }, files);
    expect(line && decodeUtf8(line.data)).toBe('{"n":1}');
    expect(await follower.line({ path: null, offset: 8, length: 700 }, files)).toBeNull();
  });
});
