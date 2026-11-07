import { describe, expect, it } from 'vitest';
import { loadScreen } from '../blocked/golden-fixtures.testkit';
import { screenText } from '../blocked/screen';
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
  options: {
    lag?: number;
    read?: AgentMessageJumpDeps['readFrame'];
    /** What a working Agent redraws on top of the frame, by how many reads have happened. */
    paint?: (frame: string, read: number) => string;
  } = {},
) {
  const clock = new FakeClock();
  const modes = new TerminalMouseModes();
  modes.receive(utf8Encode('\u001b[?1000h\u001b[?1006h'));
  let position = start;
  let lag = 0;
  let reads = 0;
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
        reads += 1;
        const shown = lag > 0 ? Math.min(frames.length - 1, position + 1) : position;
        lag = Math.max(0, lag - 1);
        const frame = frames[shown] as string;
        return options.paint ? options.paint(frame, reads) : frame;
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
  return { jump, clock, modes, scrolls, finish, position: () => position, reads: () => reads };
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

  it('recognises a message the Composer sent, with no prompt glyph on screen', async () => {
    const frames = ['a long message I sent', 'filler one', 'filler two'];
    const { jump, finish, position } = setup(frames, 2);
    jump.recordSubmitted('a long message I sent');
    expect(await finish(jump.jump('older'))).toBe('found');
    expect(position()).toBe(0);
  });

  it('keeps walking when the Composer sends mid-walk', async () => {
    const { jump, finish, clock, position } = setup(FRAMES, 4);
    const outcome = jump.jump('older');
    await clock.advance(SCREEN_POLL_MS);
    jump.recordSubmitted('a message sent meanwhile');
    expect(await finish(outcome)).toBe('found');
    expect(position()).toBe(1);
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

const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';

/** The Agent's live rows, each redrawn on every read the way the capture's program draws them. */
const ANIMATIONS = [
  {
    stem: 'grok-03-working',
    paint: (frame: string, read: number) =>
      frame.replace(/. Sleep 45 seconds then echo done… [\d.]+s/u, (row) =>
        row.replace(/^./u, SPINNER[read % 10] as string).replace(/[\d.]+s$/u, `${read / 10}s`),
      ),
  },
  {
    stem: 'opencode-08-working-180',
    paint: (frame: string, read: number) =>
      frame.replace(
        /[■⬝]+ esc interrupt/u,
        `${'■'.repeat(read % 8)}${'⬝'.repeat(8 - (read % 8))} esc interrupt`,
      ),
  },
  {
    stem: 'codex-18-x7-phone-async-countdown',
    paint: (frame: string, read: number) =>
      frame
        .replace(/Working \(\d+s/u, `Working (${12 + read}s`)
        .replace(/questions · \d+s/u, `questions · ${20 - (read % 20)}s`),
  },
];

/** A Claude-style screen: `height` rows of `transcript` from `top`, over a pinned status and box. */
const claudeFrame = (transcript: string[], top: number, height = 18): string =>
  [
    ...transcript.slice(top, top + height),
    '',
    '✻ Thinking… (0s · ↑ 0 tokens · esc to interrupt)',
    '',
    '╭──────────────────────────────────────────────────────────────────────────╮',
    '│ >                                                                        │',
    '╰──────────────────────────────────────────────────────────────────────────╯',
    '  ? for shortcuts',
  ].join('\n');

/** Claude's verb, timer and tokens all change, so the row shares nothing with the last read. */
const claudeTick = (frame: string, read: number): string =>
  frame.replace(
    /. Thinking… \(0s · ↑ 0 tokens/u,
    `${'✻✶✢·'[read % 4]} ${['Thinking', 'Pondering', 'Cogitating'][read % 3]}… (${read}s · ↑ ${read * 40} tokens`,
  );

const replyRows = (count: number, from: number) =>
  Array.from({ length: count }, (_, i) => `  line ${from + i} of the reply, about the walk`);

describe('AgentMessageJump with an Agent working', () => {
  const TRANSCRIPT = [
    '> first message from the user',
    ...replyRows(60, 0),
    '> second message from the user',
    ...replyRows(20, 60),
  ];
  const FRAMES = Array.from({ length: 10 }, (_, i) =>
    claudeFrame(TRANSCRIPT, Math.min(i * 8, TRANSCRIPT.length - 18)),
  );
  const SECOND_MESSAGE_FRAME = 7;

  it.each(ANIMATIONS)('finds the top in a few steps under $stem', async ({ stem, paint }) => {
    const frame = screenText(loadScreen(stem));
    expect(paint(frame, 1)).not.toBe(paint(frame, 2));
    const { jump, finish, scrolls, reads } = setup([frame], 0, { paint });
    expect(await finish(jump.jump('older'))).toBe('reachedEnd');
    expect(scrolls.length).toBeLessThanOrEqual(3);
    expect(reads()).toBeLessThanOrEqual(3 * (SCREEN_READ_SETTLE_MS / SCREEN_POLL_MS + 1));
  });

  it('finds the live bottom in a few steps while the status row churns', async () => {
    const { jump, finish, scrolls } = setup(FRAMES, FRAMES.length - 1, { paint: claudeTick });
    expect(await finish(jump.jump('newer'))).toBe('reachedEnd');
    expect(scrolls.length).toBeLessThanOrEqual(3);
  });

  it('keeps walking a long reply to the next message while the status row churns', async () => {
    const { jump, finish, position } = setup(FRAMES, SECOND_MESSAGE_FRAME, { paint: claudeTick });
    expect(await finish(jump.jump('older'))).toBe('found');
    expect(position()).toBe(0);
  });

  it('waits out reads that show only the spinner before the repaint lands', async () => {
    const { jump, finish, position, scrolls } = setup(FRAMES, SECOND_MESSAGE_FRAME, {
      paint: claudeTick,
      lag: 3,
    });
    expect(await finish(jump.jump('older'))).toBe('found');
    expect(position()).toBe(0);
    expect(scrolls).toHaveLength(SECOND_MESSAGE_FRAME);
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
