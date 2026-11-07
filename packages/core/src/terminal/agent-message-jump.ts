import type { Clock } from '../hosts/cancellation';
import {
  type JumpDirection,
  type JumpOutcome,
  type MessageJumpPolicy,
  TerminalMessageJumpController,
} from './message-jump';
import type { TerminalMouseModes } from './mouse-modes';
import {
  AttachUserMessageIndex,
  MAXIMUM_PROMPT_INDENT,
  type OutgoingSource,
} from './user-message-index';

// Swift `AgentMessageJumpWiring`, with one difference: Swift read the frame off the local terminal
// surface, and here that surface exposes no text, so a frame is a read of the pane on the Host. The
// remote TUI and herdr's own scrollback both repaint what `agent.read` sees when a wheel report
// arrives on the Attach, so the read shows the same place the terminal does, a round trip later.

/** Between reads while a step's repaint is awaited. */
export const SCREEN_POLL_MS = 200;
/**
 * How long a step may go without a changed read. Longer than the controller's default, which
 * assumes a local frame: this one covers the paced scroll going out and a read coming back.
 */
export const SCREEN_READ_SETTLE_MS = 1500;

/** How one program's prompts are recognised and walked (Swift `AgentMessageJumpProfile`). */
export interface MessageJumpProfile {
  readonly policy: MessageJumpPolicy;
  /** Columns a prompt glyph may be indented; tool output sits deeper. */
  readonly maximumPromptIndent: number;
}

export const DEFAULT_MESSAGE_JUMP_PROFILE: MessageJumpProfile = {
  policy: 'neighborAppearance',
  maximumPromptIndent: MAXIMUM_PROMPT_INDENT,
};

export type AgentJumpResult =
  | JumpOutcome
  /** The screen could not be read, so nothing is known about where the walk ended. */
  | 'failed';

export interface AgentMessageJumpDeps {
  clock: Clock;
  modes: TerminalMouseModes;
  /** The live grid, or null before the first layout. */
  grid(): { cols: number; rows: number } | null;
  /** The same lossy path touch scrolling rides. */
  scroll(sequence: Uint8Array, rows: number): void;
  /** The pane as plain text; null or a rejection when it cannot be read. */
  readFrame(): Promise<string | null>;
  profile?: MessageJumpProfile;
}

/** One Agent terminal's message jump: scrolls the remote, and reads the Host for each frame. */
export class AgentMessageJump {
  private readonly index: AttachUserMessageIndex;
  private readonly controller: TerminalMessageJumpController;
  private running = false;
  private stopped = false;
  private failed = false;
  /** Whether a read has come back since the last step: silence is not evidence of the end. */
  private answered = true;
  /** Advanced by every step and stop, so a read still in flight can tell it was overtaken. */
  private generation = 0;
  private lastFrame = '';

  constructor(private readonly deps: AgentMessageJumpDeps) {
    const profile = deps.profile ?? DEFAULT_MESSAGE_JUMP_PROFILE;
    this.index = new AttachUserMessageIndex(profile.maximumPromptIndent);
    this.controller = new TerminalMessageJumpController({
      clock: deps.clock,
      policy: profile.policy,
      configuration: { frameSettleTimeoutMs: SCREEN_READ_SETTLE_MS },
      step: (direction, rows) => this.step(direction, rows),
      visibleMessages: (frame) => this.index.visibleMessageKeys(frame),
      viewportRows: () => deps.grid()?.rows ?? null,
    });
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Whether a press can move anything now. */
  get canJump(): boolean {
    return this.deps.modes.tracksMouse;
  }

  /** Walks to the neighbouring user message; a second press during a walk is refused. */
  async jump(direction: JumpDirection): Promise<AgentJumpResult> {
    if (this.running) return 'cancelled';
    this.running = true;
    this.stopped = false;
    this.failed = false;
    this.answered = true;
    try {
      const entry = await this.read();
      if (this.stopped) return 'cancelled';
      if (entry === null) return 'failed';
      this.deliver(entry);
      const outcome = await this.controller.jump(direction);
      return this.failed ? 'failed' : outcome;
    } finally {
      this.generation += 1;
      this.running = false;
    }
  }

  /** Ends a walk in flight: the view left, or the user took over. */
  cancel(): void {
    this.stopped = true;
    this.generation += 1;
    this.controller.cancel();
  }

  /**
   * A write leaving for the PTY. A key drops any scroll still queued, and a drag's wheel reports
   * arrive here too: either way the user has taken the terminal back, so the walk gives way.
   */
  observeOutgoing(data: Uint8Array, source: OutgoingSource): void {
    this.index.observeOutgoing(data, source);
    if (this.running) this.cancel();
  }

  /** The Attach ended or was replaced: what it sent describes a scrollback that is gone. */
  reset(): void {
    this.cancel();
    this.index.reset();
  }

  private step(direction: JumpDirection, rows: number): void {
    const grid = this.deps.grid();
    const sequence = grid && this.deps.modes.wheelReport(direction, grid.cols, grid.rows);
    if (!this.answered || !sequence) {
      this.fail();
      return;
    }
    this.deps.scroll(sequence, rows);
    this.answered = false;
    this.generation += 1;
    void this.poll(this.generation);
  }

  /** Reads until the screen differs; an unchanged screen is left to the controller's timeout. */
  private async poll(generation: number): Promise<void> {
    while (generation === this.generation) {
      await new Promise<void>((resolve) => this.deps.clock.setTimeout(resolve, SCREEN_POLL_MS));
      if (generation !== this.generation) return;
      const text = await this.read();
      if (generation !== this.generation) return;
      if (text === null) {
        this.fail();
        return;
      }
      this.answered = true;
      if (text !== this.lastFrame) {
        this.deliver(text);
        return;
      }
    }
  }

  private async read(): Promise<string | null> {
    try {
      return await this.deps.readFrame();
    } catch {
      return null;
    }
  }

  private deliver(frame: string): void {
    this.lastFrame = frame;
    this.controller.frameDidChange(frame);
  }

  private fail(): void {
    this.failed = true;
    this.controller.cancel();
  }
}
