// The OpenCode record source over scripted query answers (Swift OpenCodeRecordSourceTests): what it
// reads on open and poll, and how store problems and a missing session surface.

import { describe, expect, it } from 'vitest';
import { encodeUtf8 } from '../../events/utf8';
import type { ChatSessionStoreProblem } from '../timeline/reasons';
import type { OpenCodeQueryResponse, OpenCodeStoreProblem } from './query';
import { OpenCodeRecordSource } from './record-source';
import {
  cursor,
  EPOCH,
  records,
  row,
  rowLine,
  ScriptedQueries,
  SESSION,
  sessionLine,
  storeReason,
  trailer,
  unavailableReason,
} from './record-source.testkit';

describe('OpenCode record source', () => {
  it('reads the tail on open and names the session', async () => {
    const queries = new ScriptedQueries();
    const rows = [row(4), row(7, { type: 'assistant' }), row(12, { type: 'idle' })];
    queries.answer(records(rows, { eventSeq: 12, firstSeq: 4 }));
    const source = new OpenCodeRecordSource(SESSION);
    expect(source.path).toBe(`opencode:${SESSION}`);
    expect(source.head).toEqual(encodeUtf8(SESSION));
    expect(source.windowStart).toBeNull();

    const lines = await source.open(queries.files);

    // Each row at its `seq`, then the session and its inbox past them.
    expect(lines).toEqual([...rows.map(rowLine), ...trailer(13)]);
    expect(source.readOffset).toBe(13);
    expect(source.windowStart).toBe(0);
    expect(source.hasOlder).toBe(false);
    expect(queries.queries).toEqual([
      { session: SESSION, query: { kind: 'tail', budget: 512 << 10 } },
    ]);
    expect(queries.fileCalls).toBe(0);
  });

  it('reads nothing more for an unchanged counter', async () => {
    const queries = new ScriptedQueries();
    const step = row(7, { type: 'assistant', isFinal: false, updated: EPOCH + 5000 });
    queries.answer(records([row(4), step], { eventSeq: 9, firstSeq: 4 }), {
      type: 'unchanged',
      eventSeq: 9,
    });
    const source = new OpenCodeRecordSource(SESSION);
    await source.open(queries.files);

    expect(await source.poll(queries.files)).toEqual({ type: 'unchanged' });

    // One query, whose cursor names what the source holds.
    expect(queries.shapes).toEqual([`tail ${512 << 10}`, 'poll']);
    expect(queries.lastCursor).toEqual(cursor(9, 4, 7, 2, EPOCH + 5000, [7]));
    expect(source.readOffset).toBe(10);
  });

  it('always reads as changed without an event counter', async () => {
    const queries = new ScriptedQueries();
    queries.answer(
      records([row(4), row(7)], { eventSeq: null, firstSeq: 4 }),
      records([], { eventSeq: null, firstSeq: 4, windowCount: 2 }),
    );
    const source = new OpenCodeRecordSource(SESSION);
    const opened = await source.open(queries.files);
    expect(opened?.map((line) => line.offset)).toEqual([4, 7, 8, 8]);

    const change = await source.poll(queries.files);

    expect(queries.lastCursor?.eventSeq).toBeNull();
    expect(change).toEqual({ type: 'appended', lines: trailer(8) });
    expect(source.readOffset).toBe(8);
  });

  it('appends new and updated rows', async () => {
    const queries = new ScriptedQueries();
    const running = row(7, { type: 'assistant', isFinal: false, updated: EPOCH + 5000 });
    const finished = row(7, { type: 'assistant', updated: EPOCH + 9000 });
    const idle = row(12, { type: 'idle', updated: EPOCH + 9500 });
    queries.answer(
      records([row(4), running], { eventSeq: 7, firstSeq: 4 }),
      records([finished, idle], { eventSeq: 12, firstSeq: 4, windowCount: 2 }),
      { type: 'unchanged', eventSeq: 12 },
    );
    const source = new OpenCodeRecordSource(SESSION);
    await source.open(queries.files);

    const change = await source.poll(queries.files);

    expect(change).toEqual({
      type: 'appended',
      lines: [rowLine(finished), rowLine(idle), ...trailer(13)],
    });
    expect(queries.lastCursor).toEqual(cursor(7, 4, 7, 2, EPOCH + 5000, [7]));

    // The next poll holds the new row and no longer names the finished step.
    await source.poll(queries.files);

    expect(queries.lastCursor).toEqual(cursor(12, 4, 12, 3, EPOCH + 9500));
    expect(source.readOffset).toBe(13);
  });

  it('resets the conversation when the window shrinks, as a committed undo does', async () => {
    const queries = new ScriptedQueries();
    const before = [row(4), row(7, { type: 'assistant' }), row(12, { type: 'idle' })];
    const after = [row(4), row(7, { type: 'assistant' }), row(14)];
    queries.answer(
      records(before, { eventSeq: 12, firstSeq: 4 }),
      records([row(14)], { eventSeq: 15, firstSeq: 4, windowCount: 2 }),
      records(after, { eventSeq: 15, firstSeq: 4 }),
      { type: 'unchanged', eventSeq: 15 },
    );
    const source = new OpenCodeRecordSource(SESSION);
    await source.open(queries.files);

    const change = await source.poll(queries.files);

    expect(change).toEqual({
      type: 'reset',
      lines: [...after.map(rowLine), ...trailer(16)],
      replaced: false,
    });
    expect(queries.shapes).toEqual([`tail ${512 << 10}`, 'poll', `tail ${512 << 10}`]);

    await source.poll(queries.files);

    expect(queries.lastCursor).toEqual(cursor(15, 4, 14, 3, EPOCH + 14));
  });

  it('reads the tail again on an overflow', async () => {
    const queries = new ScriptedQueries();
    const later = [row(4), row(7), row(9)];
    queries.answer(
      records([row(4), row(7)], { eventSeq: 7, firstSeq: 4 }),
      // More changed than one poll reads.
      records([row(9)], { eventSeq: 9, firstSeq: 4, windowCount: 2, overflow: true }),
      records(later, { eventSeq: 9, firstSeq: 4 }),
    );
    const source = new OpenCodeRecordSource(SESSION);
    await source.open(queries.files);

    expect(await source.poll(queries.files)).toEqual({
      type: 'reset',
      lines: [...later.map(rowLine), ...trailer(10)],
      replaced: false,
    });
    expect(queries.shapes).toEqual([`tail ${512 << 10}`, 'poll', `tail ${512 << 10}`]);

    // More rows still running than a poll names: the newest 64 are named, and a poll that finds a
    // change reads the tail instead.
    const running = Array.from({ length: 65 }, (_, i) =>
      row(100 + i, { type: 'assistant', isFinal: false }),
    );
    queries.answer(
      records(running, { eventSeq: 164, firstSeq: 4 }),
      records([], { eventSeq: 165, firstSeq: 4, windowCount: 65 }),
      records(running, { eventSeq: 165, firstSeq: 4 }),
    );
    const busy = new OpenCodeRecordSource(SESSION);
    await busy.open(queries.files);

    expect(await busy.poll(queries.files)).toEqual({
      type: 'reset',
      lines: [...running.map(rowLine), ...trailer(166)],
      replaced: false,
    });
    expect(queries.lastCursor?.openRows).toEqual(Array.from({ length: 64 }, (_, i) => 101 + i));
    expect(queries.shapes.slice(-3)).toEqual([`tail ${512 << 10}`, 'poll', `tail ${512 << 10}`]);
  });

  it('halves a truncated read twice, then fails', async () => {
    const queries = new ScriptedQueries();
    const cut = records([row(4)], { eventSeq: 4, firstSeq: 4, overflow: true });
    queries.answer(cut, cut, cut);
    const source = new OpenCodeRecordSource(SESSION);

    await expect(source.open(queries.files)).rejects.toMatchObject({
      error: {
        kind: 'hostStoreUnreadable',
        detail: "OpenCode's conversation is too large to read in one query.",
      },
    });
    expect(queries.shapes).toEqual([`tail ${512 << 10}`, `tail ${256 << 10}`, `tail ${128 << 10}`]);

    // Half the budget fits.
    queries.answer(cut, records([row(4)], { eventSeq: 4, firstSeq: 4 }));
    const lines = await source.open(queries.files);

    expect(lines).toEqual([rowLine(row(4)), ...trailer(5)]);
    expect(queries.shapes.slice(-2)).toEqual([`tail ${512 << 10}`, `tail ${256 << 10}`]);
  });

  it('is unavailable on open and missing on poll when the session goes missing', async () => {
    const queries = new ScriptedQueries();
    queries.answer({ type: 'sessionMissing', otherStores: ['opencode-beta.db'] });
    const source = new OpenCodeRecordSource(SESSION);

    // Opening says which other stores the Host has.
    expect(await unavailableReason(() => source.open(queries.files))).toEqual(
      storeReason({ kind: 'sessionMissing', otherStores: ['opencode-beta.db'] }),
    );

    // Once followed, it goes missing, and the engine opens again.
    queries.answer(
      records([row(4), row(7)], { eventSeq: 7, firstSeq: 2 }),
      { type: 'sessionMissing', otherStores: [] },
      { type: 'sessionMissing', otherStores: [] },
      { type: 'sessionMissing', otherStores: [] },
    );
    await source.open(queries.files);

    expect(await source.poll(queries.files)).toEqual({ type: 'missing' });
    expect(await source.loadOlder(queries.files, null)).toEqual({ type: 'missing' });
    expect(await source.line({ path: null, offset: 7, length: 120 }, queries.files)).toBeNull();
    expect(queries.fileCalls).toBe(0);
  });

  it('does not follow a child session', async () => {
    const queries = new ScriptedQueries();
    const child = sessionLine('ses_0a1b2c3d4e00Aa1Bb2Cc3Dd4Ee');
    const subagent = storeReason({ kind: 'subagentSession' });
    queries.answer(records([row(4)], { eventSeq: 4, firstSeq: 4, session: child }));
    const source = new OpenCodeRecordSource(SESSION);

    expect(await unavailableReason(() => source.open(queries.files))).toEqual(subagent);

    // Every read of the session line checks it again.
    queries.answer(
      records([row(4)], { eventSeq: 4, firstSeq: 4 }),
      records([row(5)], { eventSeq: 5, firstSeq: 4, windowCount: 1, session: child }),
    );
    await source.open(queries.files);

    expect(await unavailableReason(() => source.poll(queries.files))).toEqual(subagent);
  });

  it.each<[OpenCodeStoreProblem, ChatSessionStoreProblem]>([
    [
      { kind: 'noStore', path: '~/.local/share/opencode/opencode.db' },
      { kind: 'noStore', path: '~/.local/share/opencode/opencode.db' },
    ],
    [{ kind: 'noReader' }, { kind: 'noReader' }],
    [
      { kind: 'readerTooOld', version: '3.24.0' },
      { kind: 'readerTooOld', version: '3.24.0' },
    ],
    [{ kind: 'storeClosed' }, { kind: 'storeClosed' }],
    [{ kind: 'olderOpenCode' }, { kind: 'olderOpenCode' }],
    [
      { kind: 'layout', missing: ['session_v2.revert', 'session_inbox.delivery'] },
      { kind: 'unsupportedLayout', detail: 'session_v2.revert, session_inbox.delivery' },
    ],
  ])('turns the store problem %j into an unavailable reason', async (problem, reason) => {
    const queries = new ScriptedQueries();
    const unavailable: OpenCodeQueryResponse = { type: 'unavailable', problem };
    queries.answer(
      unavailable,
      records([row(4)], { eventSeq: 4, firstSeq: 2 }),
      unavailable,
      unavailable,
      unavailable,
    );
    const expected = storeReason(reason);
    const source = new OpenCodeRecordSource(SESSION);

    expect(await unavailableReason(() => source.open(queries.files))).toEqual(expected);
    await source.open(queries.files);
    expect(await unavailableReason(() => source.poll(queries.files))).toEqual(expected);
    expect(await unavailableReason(() => source.loadOlder(queries.files, null))).toEqual(expected);
    expect(
      await unavailableReason(() =>
        source.line({ path: null, offset: 4, length: 120 }, queries.files),
      ),
    ).toEqual(expected);
  });
});
