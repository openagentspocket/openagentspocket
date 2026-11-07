import { describe, expect, it } from 'vitest';
import { FakeClock } from '../hosts/cancellation';
import {
  type JumpDirection,
  type MessageJumpDeps,
  type MessageJumpPolicy,
  TerminalMessageJumpController,
} from './message-jump';

/** A remote TUI as a list of frames; each step moves a cursor and repaints (or not). */
function setup(
  frames: string[],
  start: number,
  options: {
    policy?: MessageJumpPolicy;
    viewportRows?: number | null;
    repaint?: boolean;
    /** What a working Agent redraws on a repaint, by step. */
    paint?: (frame: string, step: number) => string;
  } = {},
) {
  const clock = new FakeClock();
  let position = start;
  const steps: Array<[JumpDirection, number]> = [];
  const keys = (frame: string) => new Set(frame.match(/MSG\d+/g) ?? []);
  const deps: MessageJumpDeps = {
    clock,
    policy: options.policy,
    viewportRows: () => options.viewportRows ?? null,
    visibleMessages: keys,
    step: (direction, rows) => {
      steps.push([direction, rows]);
      const next = position + (direction === 'older' ? -1 : 1);
      const painted = (frame: string) => options.paint?.(frame, steps.length) ?? frame;
      if (next < 0 || next >= frames.length) {
        if (options.repaint !== false) {
          controller.frameDidChange(painted(frames[position] as string));
        }
        return;
      }
      position = next;
      controller.frameDidChange(painted(frames[position] as string));
    },
  };
  const controller = new TerminalMessageJumpController(deps);
  controller.frameDidChange(frames[start] as string);
  return { controller, clock, steps, position: () => position };
}

const FRAMES = ['top', 'MSG1 a', 'MSG1 b', 'MSG1 c', 'MSG2 a', 'MSG2 b', 'live'];

describe('TerminalMessageJumpController', () => {
  it('stops when a message not on screen at the press comes into view', async () => {
    const { controller, steps } = setup(FRAMES, 6);
    expect(await controller.jump('older')).toBe('found');
    expect(steps.every(([d]) => d === 'older')).toBe(true);
    expect(controller.lastRunMovedViewport).toBe(true);
    expect(controller.isRunning).toBe(false);
  });

  it('reports the end when the frame stops changing', async () => {
    const { controller } = setup(['x', 'y', 'z'], 1);
    expect(await controller.jump('older')).toBe('reachedEnd');
  });

  it('treats a repaint that never comes as the end after the settle timeout', async () => {
    const { controller, clock } = setup(['x', 'y'], 0, { repaint: false });
    const outcome = controller.jump('older');
    await clock.advance(600);
    await clock.advance(600);
    expect(await outcome).toBe('reachedEnd');
    expect(controller.lastRunMovedViewport).toBe(false);
  });

  it('exhausts its step budget while the frame keeps moving', async () => {
    const frames = Array.from({ length: 200 }, (_, i) => `row ${i}`);
    const { controller, steps } = setup(frames, 199);
    expect(await controller.jump('older')).toBe('exhausted');
    expect(steps).toHaveLength(controller.configuration.maxSteps);
  });

  it('cancels an in-flight jump and refuses a reentrant one', async () => {
    const { controller, clock } = setup(['x', 'y'], 0, { repaint: false });
    const first = controller.jump('older');
    expect(controller.isRunning).toBe(true);
    expect(await controller.jump('older')).toBe('cancelled');
    controller.cancel();
    expect(await first).toBe('cancelled');
    expect(clock.pendingTimers).toBe(0);
    expect(controller.isRunning).toBe(false);
  });

  it('ramps the step size, capped by the viewport when it is known', () => {
    const { controller } = setup(['x'], 0);
    expect([0, 1, 2, 3, 4, 8].map((i) => controller.rows(i))).toEqual([8, 8, 16, 16, 16, 16]);
    const short = setup(['x'], 0, { viewportRows: 12 }).controller;
    expect([0, 3].map((i) => short.rows(i))).toEqual([8, 10]);
    const tiny = setup(['x'], 0, { viewportRows: 5 }).controller;
    expect(tiny.rows(5)).toBe(8);
  });

  it('counts a repaint that only animated toward the end', async () => {
    const screen = 'reply row\nanother row\nyet another\n⠋ Working (0s)';
    const { controller, steps } = setup([screen], 0, {
      paint: (frame, step) => frame.replace('⠋ Working (0s)', `⠙ Working (${step}s)`),
    });
    expect(await controller.jump('newer')).toBe('reachedEnd');
    expect(steps).toHaveLength(controller.configuration.unchangedFramesBeforeEnd);
    expect(controller.lastRunMovedViewport).toBe(false);
  });

  it('counts a message coming into view as movement, however little else changed', () => {
    const { controller } = setup(['x'], 0);
    const chrome = 'status row\nmodel row\nfooter row\nhint row\nmode row\n';
    expect(controller.frameMoved(`${chrome}reply`, `${chrome}MSG1`)).toBe(true);
    expect(controller.frameMoved(`${chrome}reply`, `${chrome}other`)).toBe(false);
  });

  it('walks newer to the live bottom with returnToLive', async () => {
    const { controller, position } = setup(FRAMES, 1);
    expect(await controller.returnToLive()).toBe('reachedEnd');
    expect(position()).toBe(FRAMES.length - 1);
  });

  it('sticky policy overshoots to the older identity then reverses to the pinned prompt', async () => {
    // The pinned prompt MSG2 stays visible while MSG1 scrolls in, then leaves the screen.
    const frames = ['MSG1 only', 'MSG1 only', 'MSG1 x', 'MSG2 pinned MSG1', 'MSG2 pinned'];
    const { controller, steps } = setup(frames, 4, { policy: 'stickyPromptOvershoot' });
    expect(await controller.jump('older')).toBe('found');
    expect(steps.some(([, rows]) => rows === 1)).toBe(false);

    // Entry MSG2 stays visible (travel), then leaves; the loop reverses one row until it returns.
    const second = setup(['MSG1 a', 'MSG1 b', 'MSG2 p', 'MSG2 q'], 3, {
      policy: 'stickyPromptOvershoot',
    });
    expect(await second.controller.jump('older')).toBe('found');
    expect(second.steps.at(-1)).toEqual(['newer', 1]);
    expect(second.position()).toBe(2);
  });

  it('sticky policy without travel treats the new identity as the neighbour', async () => {
    const frames = ['MSG1 x', 'MSG1 y', 'MSG2 z'];
    const { controller } = setup(frames, 2, { policy: 'stickyPromptOvershoot' });
    expect(await controller.jump('older')).toBe('found');
  });
});
