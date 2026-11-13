import { describe, expect, it } from 'vitest';
import { IDLE, project, text, tool, turn, user, WORKING } from './helpers.test-util';
import { latestAnswer } from './latest-answer';
import { rowID } from './row';

describe('the latest answer', () => {
  it('is the newest run of the Agent messages, whole', () => {
    const rows = [user('u1'), text('a1'), user('u2'), tool('c1'), text('a2'), text('a3')];
    const output = project(rows, { turns: [turn('u1'), turn('u2')], signals: IDLE });
    expect(latestAnswer(output.rows)).toEqual({ id: rowID.entry('a3'), text: 'a2\n\na3' });
  });

  it('is the finished turn above a running one, not what the running turn writes', () => {
    const rows = [user('u1'), tool('c0'), text('a1'), user('u2'), tool('c1'), text('n1')];
    const output = project(rows, {
      turns: [turn('u1'), turn('u2', { ended: false })],
      signals: WORKING,
    });
    expect(latestAnswer(output.rows)?.id).toBe(rowID.entry('a1'));
  });

  it('is none before the Agent answered, or inside an open fold', () => {
    const asked = project([user('u1')], { turns: [turn('u1')] });
    expect(latestAnswer(asked.rows)).toBeNull();
    const rows = [user('u1'), text('n1'), tool('c1'), text('a1')];
    const open = project(rows, { turns: [turn('u1')], open: new Set([rowID.turn('a1')]) });
    // The muted process text inside the open fold is not the answer; a1 is.
    expect(latestAnswer(open.rows)).toEqual({ id: rowID.entry('a1'), text: 'a1' });
  });
});
