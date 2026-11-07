import type { Clock } from '../hosts/cancellation';
import type { JumpDirection } from './message-jump';
import { paneTakesWheelJump, type TerminalMouseModes } from './mouse-modes';

// Swift `AgenticoTerminalView+Gestures` and `TerminalTouchScrollAccumulator`: a finger on a terminal
// whose remote tracks the mouse. The renderer's own pan cannot serve it: it turns the drag into a
// wheel report at the mouse position, a finger never sets one, and Ghostty drops a report from
// outside the grid. So the app sends the report, aimed at the grid's centre.

const MINIMUM_POINTS_PER_ROW = 8;
/** A terminal row against its text size. A wheel notch is no exact row, so this need not be either. */
const ROW_HEIGHT_RATIO = 1.25;
const FRAME_MS = 16;
const MINIMUM_FLICK_SPEED = 80;
const MAXIMUM_FLICK_SPEED = 4000;
const FLICK_STOP_SPEED = 20;
const FLICK_DECAY_PER_MS = 0.998;

/** Points of finger travel for one row at this text size. */
export const pointsPerRow = (fontSize: number): number =>
  Math.max(MINIMUM_POINTS_PER_ROW, fontSize * ROW_HEIGHT_RATIO);

/** Finger travel into whole rows; what is left of a row waits for the next move. */
export class TouchScrollAccumulator {
  private remainder = 0;

  reset(): void {
    this.remainder = 0;
  }

  rows(translationY: number, rowPoints: number): number {
    if (rowPoints <= 0) return 0;
    if (this.remainder * translationY < 0) this.remainder = 0;
    this.remainder += translationY;
    const rows = Math.trunc(this.remainder / rowPoints) || 0;
    this.remainder -= rows * rowPoints;
    return rows;
  }
}

export interface TerminalTouchScrollDeps {
  clock: Clock;
  modes: TerminalMouseModes;
  paneId: string;
  /** The live grid, or null before the first layout. */
  grid(): { cols: number; rows: number } | null;
  /** The lossy path a Message Jump rides too. */
  scroll(sequence: Uint8Array, rows: number): void;
  /** Rows left for the remote: the user has the terminal, so anything walking it gives way. */
  didScroll?(): void;
}

/** One terminal's drag and flick. Inactive, it sends nothing and the renderer's own scroll stands. */
export class TerminalTouchScroll {
  private readonly accumulator = new TouchScrollAccumulator();
  private readonly listeners = new Set<() => void>();
  private active: boolean;
  private velocity = 0;
  private rowPoints = 0;
  private timer: unknown = null;

  constructor(private readonly deps: TerminalTouchScrollDeps) {
    this.active = this.takesWheel();
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Whether a drag reaches the remote now; a tmux pane never does, the wheel means copy-mode. */
  readonly isActive = (): boolean => this.active;

  /** Output reached the modes, or they were reset. */
  modesDidChange(): void {
    const active = this.takesWheel();
    if (active === this.active) return;
    this.active = active;
    if (!active) this.halt();
    for (const listener of [...this.listeners]) listener();
  }

  /** The finger moved by `translationY` points; down walks toward older content. */
  drag(translationY: number, rowPoints: number): void {
    if (!this.active) return;
    const rows = this.accumulator.rows(translationY, rowPoints);
    if (rows === 0) return;
    const direction: JumpDirection = rows > 0 ? 'older' : 'newer';
    const grid = this.deps.grid();
    const sequence = grid && this.deps.modes.wheelReport(direction, grid.cols, grid.rows);
    if (!sequence) return;
    this.deps.scroll(sequence, Math.abs(rows));
    this.deps.didScroll?.();
  }

  /** The finger lifted at `velocityY` points a second; a fast enough one carries on. */
  release(velocityY: number, rowPoints: number): void {
    this.stopFlick();
    if (!this.active || Math.abs(velocityY) < MINIMUM_FLICK_SPEED) {
      this.accumulator.reset();
      return;
    }
    const speed = Math.min(MAXIMUM_FLICK_SPEED, Math.abs(velocityY));
    this.velocity = Math.sign(velocityY) * speed;
    this.rowPoints = rowPoints;
    this.schedule();
  }

  /** A touch, a key or a change of mode ends whatever is running. */
  halt(): void {
    this.stopFlick();
    this.accumulator.reset();
  }

  private takesWheel(): boolean {
    return this.deps.modes.tracksMouse && paneTakesWheelJump(this.deps.paneId);
  }

  private schedule(): void {
    this.timer = this.deps.clock.setTimeout(() => this.frame(), FRAME_MS);
  }

  private frame(): void {
    this.timer = null;
    if (Math.abs(this.velocity) < FLICK_STOP_SPEED) {
      this.halt();
      return;
    }
    this.schedule();
    this.drag((this.velocity * FRAME_MS) / 1000, this.rowPoints);
    this.velocity *= FLICK_DECAY_PER_MS ** FRAME_MS;
  }

  private stopFlick(): void {
    if (this.timer !== null) this.deps.clock.clearTimeout(this.timer);
    this.timer = null;
    this.velocity = 0;
  }
}
