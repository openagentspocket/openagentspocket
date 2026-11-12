import '../programs';
// The Pi and Oh My Pi wiring through the conversation engine: locating the session file, naming the
// conversation by its header across Oh My Pi's atomic rewrites, and explaining a file it cannot read.

import { describe, expect, it } from 'vitest';
import { encodeUtf8 } from '../../events/utf8';
import { standardAdapter } from '../engine/adapter';
import { ChatConversationEngine } from '../engine/engine';
import { VolatileChatTranscriptCache } from '../model/cache';
import { FakeHostFiles } from '../model/fake-host-files';
import { type ChatProgram, projectionContext } from '../model/types';

const ID = 'f3c2a481-54ed-4c7e-a240-6d036157dc80';
const PATH = `/home/test/.pi/agent/sessions/--project--/2026-10-15_${ID}.jsonl`;
const HEADER = `{"type":"session","version":3,"id":"${ID}","cwd":"/project"}`;
const NOW = projectionContext();

const text = (rows: string[]) => `${rows.join('\n')}\n`;

function engineFor(
  files: FakeHostFiles,
  program: 'pi' | 'omp',
  cache = new VolatileChatTranscriptCache(),
) {
  const adapter = standardAdapter(program as ChatProgram);
  if (!adapter) throw new Error('no adapter');
  const engine = new ChatConversationEngine({
    reference: { program, sessionID: PATH },
    cacheKey: { hostID: 'h1', herdrSession: '', program, conversationID: PATH },
    files,
    cache,
    adapter,
  });
  return { engine, cache };
}

describe('Pi conversation engine', () => {
  it.each(['pi', 'omp'] as const)('waits for the first reply of %s', async (program) => {
    const { engine } = engineFor(new FakeHostFiles(), program);
    const snapshot = await engine.open(['/project'], NOW);
    expect(snapshot.phase).toEqual({
      type: 'unavailable',
      reason: { kind: 'awaitingFirstMessage', program },
    });
  });

  it('treats a zero-byte file as awaiting the first message', async () => {
    const files = new FakeHostFiles();
    files.write(PATH, '');
    const { engine } = engineFor(files, 'pi');
    expect((await engine.open([], NOW)).phase).toMatchObject({
      reason: { kind: 'awaitingFirstMessage' },
    });
  });

  it('follows a session and reads its entries', async () => {
    const files = new FakeHostFiles();
    files.write(
      PATH,
      text([
        HEADER,
        '{"type":"message","id":"u1","parentId":null,"message":{"role":"user","content":"hello"}}',
      ]),
    );
    const { engine } = engineFor(files, 'pi');
    const snapshot = await engine.open([], NOW);
    expect(snapshot.phase).toEqual({ type: 'following', path: PATH });
    expect(snapshot.transcript.entries.map((entry) => entry.id)).toEqual(['pi:u1']);
  });

  it('says a file shown before and gone now is not found', async () => {
    const files = new FakeHostFiles();
    files.write(
      PATH,
      text([
        HEADER,
        '{"type":"message","id":"u1","parentId":null,"message":{"role":"user","content":"hello"}}',
      ]),
    );
    const { engine } = engineFor(files, 'pi');
    expect((await engine.open([], NOW)).phase.type).toBe('following');
    files.remove(PATH);
    const gone = await engine.poll(NOW);
    expect(gone.phase).toEqual({
      type: 'unavailable',
      reason: { kind: 'notFound', searchedAll: true },
    });
  });

  it('explains a session version it does not read', async () => {
    const files = new FakeHostFiles();
    files.write(PATH, text([HEADER.replace('"version":3', '"version":9')]));
    const { engine } = engineFor(files, 'omp');
    expect((await engine.open([], NOW)).phase).toEqual({
      type: 'unavailable',
      reason: { kind: 'unsupportedFormat', format: 'Oh My Pi session version 9' },
    });
  });

  it('keeps the saved conversation through an Oh My Pi header rewrite', async () => {
    const slot = '{"type":"title","v":1,"title":"Echo","source":"auto","pad":"          "}';
    const user =
      '{"type":"message","id":"u1","parentId":null,"message":{"role":"user","content":"hello"}}';
    const answer =
      '{"type":"message","id":"a1","parentId":"u1","message":{"role":"assistant","content":[{"type":"text","text":"a reply long enough to prune"}],"stopReason":"stop"}}';
    const files = new FakeHostFiles();
    files.write(PATH, encodeUtf8(text([slot, HEADER, user, answer])));
    const { engine, cache } = engineFor(files, 'omp');
    const opened = await engine.open([], NOW);
    await engine.save(true);
    const key = { hostID: 'h1', herdrSession: '', program: 'omp', conversationID: PATH } as const;
    expect((await cache.load(key)).type).toBe('hit');
    // Oh My Pi's atomic rewrite fills in the header's title and prunes the reply: the head and the
    // end both change, the session does not.
    const titled = HEADER.replace('}', ',"title":"Echo","titleSource":"auto"}');
    const pruned =
      '{"type":"message","id":"a1","parentId":"u1","message":{"role":"assistant","content":[],"stopReason":"stop"}}';
    files.write(PATH, encodeUtf8(text([slot, titled, user, pruned])), 3);
    const rewritten = await engine.poll(NOW);
    expect(rewritten.phase).toEqual({ type: 'following', path: PATH });
    expect(rewritten.layoutGeneration).toBe(opened.layoutGeneration + 1);
    expect(rewritten.transcript.entries[0]?.id).toBe('pi:u1');
    const saved = await cache.load(key);
    expect(saved.type === 'hit' && saved.document.entries[0]?.id).toBe('pi:u1');
  });
});
