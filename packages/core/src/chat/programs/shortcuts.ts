// One-tap controls for an Agent's program (the composer's shortcuts menu): keys it presses through
// `agent.send_keys`, or a slash command it types into the draft. Each program lists its own from
// its documentation; a program Chat does not know gets the keys every terminal agent shares.

import { type Message, message } from '../../errors/text';

/**
 * Where a command shortcut does its work. Chat sends a draft as a message and reads the answer from
 * the conversation's records, so only a command whose result shows there may go from Chat; one
 * that opens a picker or a dialog, or whose effect only the program's screen shows, runs in the
 * Agent's terminal (`commandShortcutDraft`).
 */
export type CommandPlace =
  /** It runs and its result shows in the conversation: Chat sends it like a message. */
  | 'conversation'
  /** It opens something interactive, or shows its result only on the program's screen. */
  | 'terminal';

/** A control in the shortcuts menu. */
export type ProgramShortcut =
  | {
      readonly kind: 'keys';
      readonly title: Message;
      /** The keys as the program's docs write them (`Esc`, `Shift+Tab`). */
      readonly hint: string;
      /** herdr key names, sent in one `agent.send_keys`. */
      readonly keys: readonly string[];
    }
  | {
      readonly kind: 'command';
      readonly title: Message;
      /** The slash command, typed into the draft for the user to send. */
      readonly command: string;
      readonly runsIn: CommandPlace;
      /** Whether the command reads text typed after its name. */
      readonly argument: CommandArgument;
      /** Also in the shortcuts menu; every command is in the `/` panel. */
      readonly shortcut: boolean;
    };

/** What a command takes after its name: nothing, an optional value, or a value it needs. */
export type CommandArgument = 'none' | 'optional' | 'required';

export const keysShortcut = (title: string, hint: string, ...keys: string[]): ProgramShortcut => ({
  kind: 'keys',
  title: message(title),
  hint,
  keys,
});

/** A command shortcut; the terminal is the cautious place for one not shown to run from Chat. */
export const commandShortcut = (
  command: string,
  title: string,
  runsIn: CommandPlace = 'terminal',
): ProgramShortcut => ({
  kind: 'command',
  title: message(title),
  command,
  runsIn,
  argument: 'none',
  shortcut: true,
});

/**
 * A command of the program's own menu that only the `/` panel lists. It runs in the terminal: the
 * commands shown to run from Chat (`/compact`, Claude Code's `/context`) are shortcuts.
 */
export const menuCommand = (
  command: string,
  title: string,
  argument: CommandArgument = 'none',
): ProgramShortcut => ({
  kind: 'command',
  title: message(title),
  command,
  runsIn: 'terminal',
  argument,
  shortcut: false,
});

/** What every terminal agent answers: Esc stops the turn. */
export const COMMON_SHORTCUTS: readonly ProgramShortcut[] = [
  keysShortcut('Interrupt', 'Esc', 'esc'),
];
