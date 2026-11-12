import '../programs';
import { describe, expect, it } from 'vitest';
import { FakeHostFiles } from '../model/fake-host-files';
import type { ChatEntry, ChatToolActivity } from '../model/types';
import {
  assistantLine,
  bashLine,
  CWD,
  conversation,
  IDLE,
  makeClaudeEngine,
  resultLine,
  toText,
  userLine,
  writeClaude,
} from './fixtures.testkit';

const text = (entries: ChatEntry[]) =>
  entries.map((e) => ('text' in e.content.value ? e.content.value.text : '')).join('|');

describe('ChatConversationEngine (Claude)', () => {
  it('locates the transcript, shows its entries and follows what is appended', async () => {
    const files = new FakeHostFiles();
    const path = writeClaude(files, conversation(1));
    const { engine } = makeClaudeEngine(files);

    const opened = await engine.open([CWD], IDLE);
    expect(opened.phase).toEqual({ type: 'following', path });
    expect(opened.older).toEqual({ type: 'reachedStart' });
    expect(text(opened.transcript.entries)).toContain('answer 1');

    files.append(path, toText(conversation(1, 2)));
    const polled = await engine.poll(IDLE);
    expect(text(polled.transcript.entries)).toContain('answer 2');
    expect(polled.revision).toBeGreaterThan(opened.revision);
    // Nothing new: the revision holds, so observers do not re-render.
    expect((await engine.poll(IDLE)).revision).toBe(polled.revision);
  });

  it('says why when no transcript exists', async () => {
    const files = new FakeHostFiles();
    files.mkdir(`${files.homePath}/.claude/projects`);
    const { engine } = makeClaudeEngine(files);
    const snapshot = await engine.open([CWD], IDLE);
    expect(snapshot.phase).toMatchObject({ type: 'unavailable', reason: { kind: 'notFound' } });
  });

  it('saves, then shows the saved entries from the device before the Host answers', async () => {
    const files = new FakeHostFiles();
    writeClaude(files, conversation(2));
    const first = makeClaudeEngine(files);
    await first.engine.open([CWD], IDLE);
    await first.engine.save(true);

    const second = makeClaudeEngine(files, { cache: first.cache });
    const restored = await second.engine.restore();
    expect(restored.isFromCache).toBe(true);
    expect(restored.phase).toEqual({ type: 'locating' });
    expect(text(restored.transcript.entries)).toContain('answer 2');

    const live = await second.engine.open([CWD], IDLE);
    expect(live.isFromCache).toBe(false);
  });

  it('drops a saved document from another adapter revision', async () => {
    const files = new FakeHostFiles();
    writeClaude(files, conversation(1));
    const first = makeClaudeEngine(files);
    await first.engine.open([CWD], IDLE);
    await first.engine.save(true);
    const key = first.engine.cacheKey;
    const loaded = await first.cache.load(key);
    if (loaded.type !== 'hit') throw new Error('expected a saved document');
    await first.cache.save({ ...loaded.document, adapterRevision: 1 });

    const restored = await makeClaudeEngine(files, { cache: first.cache }).engine.restore();
    expect(restored.transcript.entries).toEqual([]);
    expect((await first.cache.load(key)).type).toBe('miss');
  });

  it('saves at most once per interval unless forced', async () => {
    const files = new FakeHostFiles();
    const path = writeClaude(files, conversation(1));
    let clock = 0;
    const { engine, cache } = makeClaudeEngine(files, { now: () => clock });
    await engine.open([CWD], IDLE);
    await engine.save();
    files.append(path, toText(conversation(1, 2)));
    await engine.poll(IDLE);
    clock = 1000;
    await engine.save();
    const early = await cache.load(engine.cacheKey);
    expect(early.type === 'hit' && early.document.entries.length).toBe(2);
    clock = 20_000;
    await engine.save();
    const late = await cache.load(engine.cacheKey);
    expect(late.type === 'hit' && late.document.entries.length).toBe(4);
  });

  it('pages older history until the file head', async () => {
    const files = new FakeHostFiles();
    writeClaude(files, conversation(12));
    const limits = { tailWindow: 900, olderPage: 700, readChunk: 400 };
    const { engine } = makeClaudeEngine(files, { limits });
    const opened = await engine.open([CWD], IDLE);
    expect(opened.older).toEqual({ type: 'available' });

    let snapshot = opened;
    for (let i = 0; i < 30 && snapshot.older.type !== 'reachedStart'; i += 1) {
      snapshot = await engine.loadOlder(IDLE);
    }
    expect(snapshot.older).toEqual({ type: 'reachedStart' });
    expect(snapshot.transcript.entries.length).toBe(24);
  });

  it('keeps what shows when the file is gone, then follows it again', async () => {
    const files = new FakeHostFiles();
    const path = writeClaude(files, conversation(1));
    const { engine } = makeClaudeEngine(files);
    await engine.open([CWD], IDLE);
    files.remove(path);
    const gone = await engine.poll(IDLE);
    expect(gone.phase.type).toBe('unavailable');
    expect(gone.isFromCache).toBe(true);
    expect(gone.transcript.entries.length).toBe(2);
    writeClaude(files, conversation(1));
    expect((await engine.open([CWD], IDLE)).phase.type).toBe('following');
  });

  it('records a read failure as data and recovers', async () => {
    const files = new FakeHostFiles();
    const path = writeClaude(files, conversation(1));
    const { engine } = makeClaudeEngine(files);
    await engine.open([CWD], IDLE);
    files.failing.add(path);
    const failed = await engine.poll(IDLE);
    expect(failed.readFailure).not.toBeNull();
    expect(failed.transcript.entries.length).toBe(2);
    files.failing.delete(path);
    expect((await engine.poll(IDLE)).readFailure).toBeNull();
  });

  it('counts a rewritten file as a new layout', async () => {
    const files = new FakeHostFiles();
    const path = writeClaude(files, conversation(2));
    const { engine } = makeClaudeEngine(files);
    const opened = await engine.open([CWD], IDLE);
    files.write(
      path,
      toText([userLine('u1', null, 'other'), assistantLine('a1', 'u1', 'different')]),
      5,
    );
    const rewritten = await engine.poll(IDLE);
    expect(rewritten.layoutGeneration).toBeGreaterThan(opened.layoutGeneration);
    expect(text(rewritten.transcript.entries)).toBe('other|different');
  });

  it('reads a tool output again for an expanded row', async () => {
    const files = new FakeHostFiles();
    writeClaude(files, [
      userLine('u1', null, 'list'),
      bashLine('a1', 'u1', 'toolu_1'),
      resultLine('r1', 'a1', 'toolu_1', 'file-one\nfile-two'),
      assistantLine('a2', 'r1', 'done'),
    ]);
    const { engine } = makeClaudeEngine(files);
    const { transcript } = await engine.open([CWD], IDLE);
    const row = transcript.entries.find((e) => e.content.type === 'tool');
    const tool: ChatToolActivity | undefined =
      row?.content.type === 'tool' ? row.content.value : undefined;
    expect(tool?.output).not.toBeNull();
    if (!tool) throw new Error('no tool row');
    const result = await engine.output(tool);
    expect(result.ok && result.output.preview?.text).toContain('file-two');
  });

  it('has no output to read before a transcript is followed', async () => {
    const files = new FakeHostFiles();
    writeClaude(files, [
      userLine('u1', null, 'list'),
      bashLine('a1', 'u1', 'toolu_1'),
      resultLine('r1', 'a1', 'toolu_1', 'out'),
    ]);
    const { transcript } = await makeClaudeEngine(files).engine.open([CWD], IDLE);
    const row = transcript.entries.find((e) => e.content.type === 'tool');
    if (row?.content.type !== 'tool') throw new Error('no tool row');
    const idle = makeClaudeEngine(files).engine;
    expect(await idle.output(row.content.value)).toEqual({
      ok: false,
      failure: { type: 'notFollowing' },
    });
  });
});
