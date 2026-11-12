import '../programs';
// The Codex wiring: the first-line session meta for a tail window, and the history-base loop of a
// reverted rollout.

import { describe, expect, it } from 'vitest';
import { RolloutBuilder } from '../codex/test-builder';
import { VolatileChatTranscriptCache } from '../model/cache';
import { FakeHostFiles } from '../model/fake-host-files';
import { standardAdapter } from './adapter';
import { ChatConversationEngine } from './engine';
import { IDLE, withLimits } from './fixtures.testkit';

const THREAD = 'thread-1';
const DAY = '/home/user/.codex/sessions/2026/10/06';
const NOW = Date.UTC(2026, 9, 6, 12);

function base(): RolloutBuilder {
  const b = new RolloutBuilder({ threadID: THREAD });
  b.turnStarted('t1');
  b.userMessage('t1', 'u1', 'first');
  b.agentMessage('t1', 'a1', 'one');
  b.turnComplete('t1');
  b.turnStarted('t2');
  b.userMessage('t2', 'u2', 'second');
  b.agentMessage('t2', 'a2', 'two');
  b.turnComplete('t2');
  b.turnStarted('t3');
  b.userMessage('t3', 'u3', 'reverted');
  b.turnComplete('t3');
  return b;
}

function engineFor(files: FakeHostFiles, limits = {}) {
  return new ChatConversationEngine({
    reference: { program: 'codex', sessionID: THREAD },
    cacheKey: { hostID: 'h1', herdrSession: '', program: 'codex', conversationID: THREAD },
    files,
    cache: new VolatileChatTranscriptCache(),
    adapter: withLimits(standardAdapter('codex'), limits),
    now: () => NOW,
  });
}

const entryIDs = (ids: { id: string }[]) => ids.map((e) => e.id);

describe('Codex conversation engine', () => {
  it('reads the dialect from line 1 when the tail window starts past it', async () => {
    const files = new FakeHostFiles();
    const b = base();
    files.write(`${DAY}/rollout-2026-10-06T00-00-00-${THREAD}.jsonl`, b.data);
    const engine = engineFor(files, { tailWindow: 700, olderPage: 700 });
    const snapshot = await engine.open([], IDLE);
    expect(snapshot.phase.type).toBe('following');
    // The window holds only the last lines, yet they read as paginated history.
    expect(snapshot.transcript.entries.length).toBeGreaterThan(0);
    expect(snapshot.older).toEqual({ type: 'available' });
    expect(snapshot.transcript.diagnostics.invalidLines).toBe(0);
  });

  it('continues a reverted rollout from its base file once the live head is loaded', async () => {
    const files = new FakeHostFiles();
    const baseRollout = base();
    const boundary = baseRollout.chatLines[9]?.offset as number;
    files.write(`${DAY}/rollout-2026-10-06T00-00-00-${THREAD}.jsonl`, baseRollout.data);
    const child = new RolloutBuilder({
      threadID: THREAD,
      historyBase: { rolloutID: THREAD, endOrdinal: 9, endOffset: boundary },
      firstOrdinal: 9,
    });
    child.turnStarted('t4');
    child.userMessage('t4', 'u4', 'after the revert');
    child.agentMessage('t4', 'a4', 'four');
    child.turnComplete('t4');
    files.write(`${DAY}/rollout-2026-10-06T01-00-00-${THREAD}_child1.jsonl`, child.data);

    const engine = engineFor(files);
    const opened = await engine.open([], IDLE);
    expect(opened.phase).toMatchObject({ type: 'following' });
    expect(entryIDs(opened.transcript.entries)).toEqual([
      'codex/child1/t4/u4',
      'codex/child1/t4/a4',
    ]);
    // The live file is whole, yet older history waits in the base.
    expect(opened.older).toEqual({ type: 'available' });

    const loaded = await engine.loadOlder(IDLE);
    expect(entryIDs(loaded.transcript.entries)).toEqual([
      `codex/${THREAD}/t1/u1`,
      `codex/${THREAD}/t1/a1`,
      `codex/${THREAD}/t2/u2`,
      `codex/${THREAD}/t2/a2`,
      'codex/child1/t4/u4',
      'codex/child1/t4/a4',
    ]);
    expect(loaded.older).toEqual({ type: 'reachedStart' });
  });

  it('ends the lineage when the base file is gone', async () => {
    const files = new FakeHostFiles();
    const child = new RolloutBuilder({
      threadID: THREAD,
      historyBase: { rolloutID: 'missing-base', endOrdinal: 9, endOffset: 100 },
      firstOrdinal: 9,
    });
    child.turnStarted('t4');
    child.userMessage('t4', 'u4', 'after');
    child.turnComplete('t4');
    files.write(`${DAY}/rollout-2026-10-06T01-00-00-${THREAD}_child1.jsonl`, child.data);
    const engine = engineFor(files);
    const opened = await engine.open([], IDLE);
    expect(opened.older).toEqual({ type: 'available' });
    const loaded = await engine.loadOlder(IDLE);
    expect(loaded.older).toEqual({ type: 'reachedStart' });
    // The lineage stops there and the rows say older history is unavailable.
    expect(loaded.transcript.entries.map((e) => e.content.type)).toEqual(['divider', 'user']);
  });

  it('follows the live file a revert moved to when relocating', async () => {
    const files = new FakeHostFiles();
    const baseRollout = base();
    files.write(`${DAY}/rollout-2026-10-06T00-00-00-${THREAD}.jsonl`, baseRollout.data);
    const engine = engineFor(files);
    const opened = await engine.open([], IDLE);
    expect(opened.phase).toMatchObject({ type: 'following' });
    const boundary = baseRollout.chatLines[9]?.offset as number;
    const child = new RolloutBuilder({
      threadID: THREAD,
      historyBase: { rolloutID: THREAD, endOrdinal: 9, endOffset: boundary },
      firstOrdinal: 9,
    });
    child.turnStarted('t4');
    child.userMessage('t4', 'u4', 'after the revert');
    child.turnComplete('t4');
    const childPath = `${DAY}/rollout-2026-10-06T01-00-00-${THREAD}_child1.jsonl`;
    files.write(childPath, child.data);
    const moved = await engine.relocate(IDLE);
    expect(moved.phase).toEqual({ type: 'following', path: childPath });
    expect(entryIDs(moved.transcript.entries)).toContain('codex/child1/t4/u4');
  });

  it('names a compressed rollout instead of showing it', async () => {
    const files = new FakeHostFiles();
    files.write(
      `${DAY}/rollout-2026-10-06T00-00-00-${THREAD}.jsonl.zst`,
      new Uint8Array([1, 2, 3]),
    );
    const snapshot = await engineFor(files).open([], IDLE);
    expect(snapshot.phase).toMatchObject({ type: 'unavailable', reason: { kind: 'compressed' } });
  });
});
