import { describe, expect, it } from 'vitest';
import { FakeClock } from '../hosts/cancellation';
import { asciiBytes } from './bytes';
import {
  MAXIMUM_PENDING_SCROLL_ROWS,
  MAXIMUM_SCROLL_ROWS_PER_WRITE,
  SCROLL_PACING_MS,
  TerminalAttachInputQueue,
} from './input-queue';

const UP = asciiBytes('\x1b[A');
const DOWN = asciiBytes('\x1b[B');

describe('TerminalAttachInputQueue', () => {
  it('delivers reliable input in order, resizes included', async () => {
    const queue = new TerminalAttachInputQueue();
    queue.send(asciiBytes('a'));
    queue.resize(100, 30);
    queue.send(asciiBytes('b'));
    expect((await queue.next())?.kind).toBe('keystrokes');
    expect(await queue.next()).toEqual({ kind: 'resize', cols: 100, rows: 30 });
    expect((await queue.next())?.kind).toBe('keystrokes');
  });

  it('drops empty keystrokes', async () => {
    const queue = new TerminalAttachInputQueue();
    queue.send(new Uint8Array(0));
    queue.finish();
    expect(await queue.next()).toBeNull();
  });

  it('discards pending scroll momentum when a key arrives', async () => {
    const queue = new TerminalAttachInputQueue();
    queue.scroll(UP, 8);
    queue.send(asciiBytes('k'));
    expect((await queue.next())?.kind).toBe('keystrokes');
    queue.finish();
    expect(await queue.next()).toBeNull();
  });

  it('replaces stale momentum on a direction change', async () => {
    const queue = new TerminalAttachInputQueue();
    queue.scroll(UP, 6);
    queue.scroll(DOWN, 2);
    const item = await queue.next();
    expect(item).toEqual({ kind: 'scroll', data: Uint8Array.from([...DOWN, ...DOWN]) });
  });

  it('bounds the backlog and writes it in small batches', async () => {
    const queue = new TerminalAttachInputQueue();
    queue.scroll(UP, 100);
    let total = 0;
    for (let index = 0; index < 4; index += 1) {
      const item = await queue.next();
      expect(item?.kind).toBe('scroll');
      if (item?.kind === 'scroll') {
        const count = item.data.length / UP.length;
        expect(count).toBeLessThanOrEqual(MAXIMUM_SCROLL_ROWS_PER_WRITE);
        total += count;
      }
    }
    expect(total).toBe(MAXIMUM_PENDING_SCROLL_ROWS);
  });

  it('hands scroll straight to a waiting consumer and keeps the rest pending', async () => {
    const queue = new TerminalAttachInputQueue();
    const waiting = queue.next();
    queue.scroll(UP, 5);
    expect(await waiting).toEqual({ kind: 'scroll', data: Uint8Array.from([...UP, ...UP, ...UP]) });
    expect(await queue.next()).toEqual({ kind: 'scroll', data: Uint8Array.from([...UP, ...UP]) });
  });

  it('pump writes in order and paces scroll so a key never waits behind a backlog', async () => {
    const clock = new FakeClock();
    const queue = new TerminalAttachInputQueue();
    const writes: string[] = [];
    queue.scroll(UP, 9);
    const pumped = queue.pump(
      clock,
      async (data) => {
        writes.push(String(data.length));
      },
      async (cols, rows) => {
        writes.push(`resize ${cols}x${rows}`);
      },
    );
    await clock.advance(0);
    expect(writes).toEqual(['9']);
    queue.send(asciiBytes('k'));
    queue.resize(90, 20);
    await clock.advance(SCROLL_PACING_MS);
    expect(writes).toEqual(['9', '1', 'resize 90x20']);
    queue.finish();
    await clock.advance(SCROLL_PACING_MS);
    await pumped;
  });

  it('keeps accepted reliable input when finished', async () => {
    const queue = new TerminalAttachInputQueue();
    queue.send(asciiBytes('x'));
    queue.finish();
    queue.send(asciiBytes('late'));
    expect((await queue.next())?.kind).toBe('keystrokes');
    expect(await queue.next()).toBeNull();
  });
});
