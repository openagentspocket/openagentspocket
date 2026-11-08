// One-tap controls for an Agent's program (the composer's shortcuts menu): keys it presses through
// `agent.send_keys`, or a slash command it types into the draft. Each program lists its own from
// its documentation; a program Chat does not know gets the keys every terminal agent shares.

import { type Message, message } from '../../errors/text';

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
    };

export const keysShortcut = (title: string, hint: string, ...keys: string[]): ProgramShortcut => ({
  kind: 'keys',
  title: message(title),
  hint,
  keys,
});

export const commandShortcut = (command: string, title: string): ProgramShortcut => ({
  kind: 'command',
  title: message(title),
  command,
});

/** What every terminal agent answers: Esc stops the turn. */
export const COMMON_SHORTCUTS: readonly ProgramShortcut[] = [
  keysShortcut('Interrupt', 'Esc', 'esc'),
];
