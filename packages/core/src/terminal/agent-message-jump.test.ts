import { describe, expect, it } from 'vitest';
import { messageJumpProfile } from '../chat/programs';
import { FakeClock } from '../hosts/cancellation';
import { utf8Encode } from '../pairing/bytes';
import {
  AgentMessageJump,
  type AgentMessageJumpDeps,
  DEFAULT_MESSAGE_JUMP_PROFILE,
  SCREEN_POLL_MS,
  SCREEN_READ_SETTLE_MS,
} from './agent-message-jump';
import { TerminalMouseModes } from './mouse-modes';

/**
 * A remote TUI behind `agent.read`: wheel reports move a cursor over the frames, and a read answers
 * with the frame the cursor is on, `lag` reads later than the scroll.
 */
function setup(
  frames: string[],
  start: number,
  options: { lag?: number; read?: AgentMessageJumpDeps['readFrame'] } = {},
) {
  const clock = new FakeClock();
  const modes = new TerminalMouseModes();
  modes.receive(utf8Encode('\u001b[?1000h\u001b[?1006h'));
  let position = start;
  let lag = 0;
  const scrolls: Array<[string, number]> = [];
  const jump = new AgentMessageJump({
    clock,
    modes,
    grid: () => ({ cols: 80, rows: 24 }),
    scroll: (sequence, rows) => {
      const older = sequence[3] === 0x36 && sequence[4] === 0x34;
      scrolls.push([older ? 'older' : 'newer', rows]);
      position = Math.max(0, Math.min(frames.length - 1, position + (older ? -1 : 1)));
      lag = options.lag ?? 0;
    },
    readFrame:
      options.read ??
      (async () => {
        if (lag > 0) {
          lag -= 1;
          return frames[Math.min(frames.length - 1, position + 1)] as string;
        }
        return frames[position] as string;
      }),
  });
  /** Runs the clock until `result` settles. */
  const finish = async <T>(result: Promise<T>): Promise<T> => {
    let done = false;
    void result.finally(() => {
      done = true;
    });
    for (let i = 0; i < 2000 && !done; i += 1) await clock.advance(SCREEN_POLL_MS);
    return result;
  };
  return { jump, clock, modes, scrolls, finish, position: () => position };
}

const FRAMES = ['top', '> first message here', 'filler', 'more filler', '> second message here'];

describe('AgentMessageJump', () => {
  it('walks to the neighbouring message through screen reads, then stops', async () => {
    const { jump, scrolls, finish, position } = setup(FRAMES, 4);
    expect(await finish(jump.jump('older'))).toBe('found');
    expect(position()).toBe(1);
    expect(scrolls.every(([direction]) => direction === 'older')).toBe(true);
    expect(jump.isRunning).toBe(false);
  });

  it('walks back toward live', async () => {
    const { jump, finish, position } = setup(FRAMES, 1);
    expect(await finish(jump.jump('newer'))).toBe('found');
    expect(position()).toBe(4);
  });

  it('reports the end once reads stop changing', async () => {
    const { jump, finish, scrolls } = setup(['> only message here', 'filler'], 0);
    expect(await finish(jump.jump('older'))).toBe('reachedEnd');
    expect(scrolls.length).toBeGreaterThan(1);
  });

  it('waits out a read that still shows the old frame instead of calling it the end', async () => {
    const { jump, finish, position } = setup(FRAMES, 4, { lag: 2 });
    expect(await finish(jump.jump('older'))).toBe('found');
    expect(position()).toBe(1);
  });

  it('ends a jump that keeps finding no message on its step budget', async () => {
    const frames = Array.from({ length: 500 }, (_, i) => `row ${i}`);
    const { jump, finish } = setup(frames, 499);
    expect(await finish(jump.jump('older'))).toBe('exhausted');
  });

  it('never scrolls when the screen cannot be read at the press', async () => {
    const { jump, finish, scrolls } = setup(FRAMES, 4, { read: async () => null });
    expect(await finish(jump.jump('older'))).toBe('failed');
    expect(scrolls).toHaveLength(0);
  });

  it('fails rather than reporting the end when a read breaks mid-walk', async () => {
    let reads = 0;
    const { jump, finish } = setup(FRAMES, 4, {
      read: async () => {
        reads += 1;
        if (reads > 1) throw new Error('gone');
        return FRAMES[4] as string;
      },
    });
    expect(await finish(jump.jump('older'))).toBe('failed');
  });

  it('fails rather than reporting the end when reads never come back', async () => {
    let reads = 0;
    const { jump, finish } = setup(FRAMES, 4, {
      read: () => {
        reads += 1;
        return reads === 1 ? Promise.resolve(FRAMES[4] as string) : new Promise(() => undefined);
      },
    });
    expect(await finish(jump.jump('older'))).toBe('failed');
  });

  it('ends a walk on cancel, and ignores the read that was in flight', async () => {
    const { jump, clock, scrolls } = setup(['a', 'b', 'c', 'd', 'e', 'f'], 5);
    const outcome = jump.jump('older');
    await clock.advance(SCREEN_POLL_MS);
    await clock.advance(SCREEN_POLL_MS);
    jump.cancel();
    expect(await outcome).toBe('cancelled');
    const steps = scrolls.length;
    await clock.advance(SCREEN_READ_SETTLE_MS * 2);
    expect(scrolls).toHaveLength(steps);
    expect(jump.isRunning).toBe(false);
  });

  it('ends before the first step when cancelled during the opening read', async () => {
    let answer: (text: string) => void = () => undefined;
    const { jump, scrolls } = setup(FRAMES, 4, {
      read: () => new Promise((resolve) => (answer = resolve)),
    });
    const outcome = jump.jump('older');
    jump.cancel();
    answer(FRAMES[4] as string);
    expect(await outcome).toBe('cancelled');
    expect(scrolls).toHaveLength(0);
  });

  it('refuses a second jump while one runs', async () => {
    const { jump, finish } = setup(FRAMES, 4);
    const first = jump.jump('older');
    expect(await jump.jump('older')).toBe('cancelled');
    expect(await finish(first)).toBe('found');
  });

  it('gives way to anything the user sends, and indexes what they sent', async () => {
    const { jump, clock } = setup(['a', 'b', 'c', 'd', 'e', 'f'], 5);
    const outcome = jump.jump('older');
    await clock.advance(SCREEN_POLL_MS);
    jump.observeOutgoing(utf8Encode('x'), 'keystroke');
    expect(await outcome).toBe('cancelled');
  });

  it('recognises a message this app sent, with no prompt glyph on screen', async () => {
    const frames = ['a long message I sent', 'filler one', 'filler two'];
    const { jump, finish, position } = setup(frames, 2);
    jump.observeOutgoing(utf8Encode('a long message I sent\r'), 'keystroke');
    expect(await finish(jump.jump('older'))).toBe('found');
    expect(position()).toBe(0);
  });

  it('forgets the session on reset, ending a walk in flight', async () => {
    const { jump, clock } = setup(['a', 'b', 'c', 'd', 'e', 'f'], 5);
    const outcome = jump.jump('older');
    await clock.advance(SCREEN_POLL_MS);
    jump.reset();
    expect(await outcome).toBe('cancelled');
  });

  it('is offered only while the remote takes wheel reports', () => {
    const { jump, modes } = setup(FRAMES, 4);
    expect(jump.canJump).toBe(true);
    modes.reset();
    expect(jump.canJump).toBe(false);
  });
});

describe('messageJumpProfile', () => {
  it('gives Grok its pinned-prompt walk', () => {
    expect(messageJumpProfile('grok')).toEqual({
      policy: 'stickyPromptOvershoot',
      maximumPromptIndent: 5,
    });
  });

  it('gives every other Agent the default, known to Chat or not', () => {
    for (const program of ['claude', 'codex', 'something-new', null, undefined]) {
      expect(messageJumpProfile(program)).toEqual(DEFAULT_MESSAGE_JUMP_PROFILE);
    }
  });
});
