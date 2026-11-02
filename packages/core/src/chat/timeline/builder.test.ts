import { describe, expect, it } from 'vitest';
import { userMessage } from '../model/factories';
import type { ChatEntry } from '../model/types';
import { ChatRowBuilder } from './builder';
import { rowID } from './row';

const entry = (id: string, text: string): ChatEntry => ({
  id,
  sourceOffset: 0,
  content: { type: 'assistant', value: { text } },
});
const prompt = (id: string): ChatEntry => ({
  id,
  sourceOffset: 0,
  content: { type: 'user', value: userMessage(id) },
});
const input = (entries: ChatEntry[], older: 'reachedStart' | 'available' = 'reachedStart') => ({
  entries,
  pending: [],
  older,
});

describe('ChatRowBuilder', () => {
  it('keeps an unchanged row and its revision, and renews a changed one', () => {
    const builder = new ChatRowBuilder();
    const first = builder.rows(input([prompt('u1'), entry('a1', 'one')]));
    const again = builder.rows(input([prompt('u1'), entry('a1', 'one')]));
    expect(again.map((row) => row.revision)).toEqual(first.map((row) => row.revision));
    const edited = builder.rows(input([prompt('u1'), entry('a1', 'two')]));
    expect(edited[0]?.revision).toBe(first[0]?.revision);
    expect(edited[1]?.revision).not.toBe(first[1]?.revision);
  });

  it('never repeats a revision for a row that leaves and comes back', () => {
    const builder = new ChatRowBuilder();
    const seen = builder.rows(input([entry('a1', 'x')]))[0]?.revision;
    builder.rows(input([]));
    expect(builder.rows(input([entry('a1', 'x')]))[0]?.revision).not.toBe(seen);
  });

  it('adds the older-history row on top and spaces rows for their neighbors', () => {
    const rows = new ChatRowBuilder().rows(input([prompt('u1'), entry('a1', 'x')], 'available'));
    expect(rows.map((row) => row.id)).toEqual([
      rowID.olderHistory,
      rowID.entry('u1'),
      rowID.entry('a1'),
    ]);
    expect(rows.map((row) => row.topSpacing)).toEqual([8, 24, 12]);
  });
});
