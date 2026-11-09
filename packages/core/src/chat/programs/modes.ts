// The mode an Agent's program is in (permissions, plan, thinking level: whatever its Shift+Tab or
// equivalent cycles), read from the bottom of its screen. One reader for every program; each
// program lists the exact text its TUI draws per mode, from its own source or docs.

import { type Message, message } from '../../errors/text';

export interface ProgramModeLabel {
  /** Text the program draws near the bottom of its screen in this mode. */
  readonly drawn: string;
  readonly title: Message;
}

export interface ProgramModes {
  /** Checked in order; the first one drawn names the mode. */
  readonly labels: readonly ProgramModeLabel[];
  /** The mode when none is drawn (a default that draws nothing), or null to show nothing. */
  readonly otherwise: Message | null;
  /** Rows that start with this are the conversation, not the footer (Codex's `• Model changed`). */
  readonly conversationRow?: string;
}

export const modeLabel = (drawn: string, title: string): ProgramModeLabel => ({
  drawn,
  title: message(title),
});

/** The rows a mode line can sit on: the prompt's footer, under its box. */
const BOTTOM_ROWS = 8;

/** The lowest row that draws a mode names it: the footer, before anything the conversation says. */
export function readProgramMode(modes: ProgramModes, screen: string): Message | null {
  const { conversationRow } = modes;
  const rows = screen
    .split('\n')
    .filter((row) => row.trim() !== '')
    .slice(-BOTTOM_ROWS)
    .filter((row) => !conversationRow || !row.trimStart().startsWith(conversationRow));
  for (const row of rows.reverse()) {
    const label = modes.labels.find((candidate) => row.includes(candidate.drawn));
    if (label) return label.title;
  }
  return modes.otherwise;
}
