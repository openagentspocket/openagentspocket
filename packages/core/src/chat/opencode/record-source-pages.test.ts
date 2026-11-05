// Older pages, spent searches, expanded rows and the Host the source needs (Swift
// OpenCodeRecordSourceTests, second half).

import { describe, expect, it } from 'vitest';
import type { ChatHostFiles } from '../model/host-files';
import { ChatOutputTooLong } from '../model/source';
import { OpenCodeRecordSource } from './record-source';
import {
  cursor,
  EPOCH,
  records,
  row,
  rowLine,
  ScriptedQueries,
  SESSION,
} from './record-source.testkit';

describe('OpenCode record source', () => {
  describe('older pages', () => {
    it('prepend until the first row', async () => {
      const queries = new ScriptedQueries();
      const tail = [row(10), row(12), row(14)];
      const page = [row(6), row(8, { type: 'assistant', isFinal: false })];
      const first = [row(2), row(4)];
      queries.answer(
        records(tail, { eventSeq: 14, firstSeq: 2 }),
        // An older read prints the counter too, which only a newer read may take.
        records(page, { eventSeq: 20, firstSeq: 2 }),
        records(first, { eventSeq: 21, firstSeq: 2 }),
        { type: 'unchanged', eventSeq: 14 },
      );
      const source = new OpenCodeRecordSource(SESSION);
      await source.open(queries.files);
      expect(source.windowStart).toBe(10);
      expect(source.hasOlder).toBe(true);
      expect(source.olderPageLengths).toEqual({ first: 512 << 10, maximum: 1 << 20 });

      // Pages hold only rows: the session and inbox lines are newer.
      expect(await source.loadOlder(queries.files, null)).toEqual({
        type: 'lines',
        lines: page.map(rowLine),
      });
      expect(source.windowStart).toBe(6);
      // A page asks for at most the largest page.
      expect(await source.loadOlder(queries.files, 4 << 20)).toEqual({
        type: 'lines',
        lines: first.map(rowLine),
      });
      expect(source.windowStart).toBe(0);
      expect(source.hasOlder).toBe(false);
      expect(await source.loadOlder(queries.files, null)).toEqual({ type: 'headReached' });
      expect(source.readOffset).toBe(15);

      await source.poll(queries.files);

      expect(queries.shapes).toEqual([
        `tail ${512 << 10}`,
        `older 10 ${512 << 10}`,
        `older 6 ${1 << 20}`,
        'poll',
      ]);
      expect(queries.lastCursor).toEqual(cursor(14, 2, 14, 7, EPOCH + 14, [8]));

      // The rows below a window can be gone: a page that finds none reaches the start.
      queries.answer(records(tail, { eventSeq: 14, firstSeq: 2 }), records([], { eventSeq: 14 }));
      const emptied = new OpenCodeRecordSource(SESSION);
      await emptied.open(queries.files);

      expect(await emptied.loadOlder(queries.files, null)).toEqual({ type: 'headReached' });
      expect(emptied.windowStart).toBe(0);
    });

    it('spend an older search after its budget', async () => {
      const queries = new ScriptedQueries();
      const page = [row(16), row(18)];
      const pageBytes = page.reduce((sum, r) => sum + r.line.length, 0);
      queries.answer(
        records([row(20), row(22)], { eventSeq: 22, firstSeq: 2 }),
        records(page, { eventSeq: 22, firstSeq: 2 }),
        records([row(12), row(14)], { eventSeq: 22, firstSeq: 2 }),
      );
      const source = new OpenCodeRecordSource(SESSION, {
        tail: 512 << 10,
        poll: 1 << 20,
        olderPage: 512 << 10,
        olderMaximumPage: 1 << 20,
        olderSearch: pageBytes + 1,
        outputLimit: 256 << 10,
      });
      await source.open(queries.files);

      source.beginOlderSearch();
      await source.loadOlder(queries.files, null);
      expect(source.olderSearchExhausted).toBe(false);
      await source.loadOlder(queries.files, null);
      expect(source.olderSearchExhausted).toBe(true);

      // The next request searches as far again.
      source.beginOlderSearch();
      expect(source.olderSearchExhausted).toBe(false);
    });
  });

  describe('output and the Host', () => {
    it('reads a row again for its expanded output', async () => {
      const queries = new ScriptedQueries();
      const expanded = row(7, { type: 'assistant', data: '{"content":[]}' });
      queries.answer(
        records([expanded], { eventSeq: 9 }),
        records([expanded], { eventSeq: 9, overflow: true }),
        records([expanded], { eventSeq: 9 }),
        records([], { eventSeq: 9 }),
      );
      const source = new OpenCodeRecordSource(SESSION);
      const reference = { path: null, offset: 7, length: 4096 };

      // The row at the reference's `seq`, with 256 Ki characters of tool output rather than 16 Ki.
      expect(await source.line(reference, queries.files)).toEqual(rowLine(expanded));
      // Output cut short asks for half as much.
      expect(await source.line(reference, queries.files)).toEqual(rowLine(expanded));
      // A row the store no longer holds is gone.
      expect(await source.line(reference, queries.files)).toBeNull();
      expect(queries.shapes).toEqual([
        `row 7 ${256 << 10}`,
        `row 7 ${256 << 10}`,
        `row 7 ${128 << 10}`,
        `row 7 ${256 << 10}`,
      ]);
      expect(queries.fileCalls).toBe(0);
    });

    it('calls a row still cut short at a quarter too long', async () => {
      const queries = new ScriptedQueries();
      const expanded = row(7, { type: 'assistant', data: '{"content":[]}' });
      const cut = records([expanded], { eventSeq: 9, overflow: true });
      queries.answer(cut, cut, cut);
      const source = new OpenCodeRecordSource(SESSION);

      await expect(
        source.line({ path: null, offset: 7, length: 4096 }, queries.files),
      ).rejects.toBeInstanceOf(ChatOutputTooLong);
      expect(queries.shapes).toEqual([
        `row 7 ${256 << 10}`,
        `row 7 ${128 << 10}`,
        `row 7 ${64 << 10}`,
      ]);
    });

    it('cannot read OpenCode without a query on the Host', async () => {
      const files: ChatHostFiles = {
        status: async () => null,
        list: async () => null,
        read: async () => ({ data: new Uint8Array(), length: null }),
        home: async () => '/home/dev',
      };
      const source = new OpenCodeRecordSource(SESSION);
      const expected = { error: { kind: 'hostFeatureUnavailable', feature: 'Chat' } };

      await expect(source.open(files)).rejects.toMatchObject(expected);
      await expect(source.poll(files)).rejects.toMatchObject(expected);
      await expect(
        source.line({ path: null, offset: 4, length: 120 }, files),
      ).rejects.toMatchObject(expected);
    });
  });
});
