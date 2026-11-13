// Screens where a program waits for something only its terminal can answer (Codex's review of new
// hooks, first). Chat and the Blocked card name the wait and send the user to the terminal; the app
// never answers one, not even with a key the user picks from a card.

import type { Message } from '../../errors/text';
import { CHAT_PROGRAMS } from '../model/types';
import { programDefinition } from './registry';

export interface TerminalWait {
  /** Stable name, for tests. */
  readonly id: string;
  /**
   * Whether a screen shows this wait, from its rows' text (trimmed, blank rows left out). Strict:
   * a wrong match would take the buttons off a dialog the user can answer from the phone.
   */
  readonly shows: (rows: readonly string[]) => boolean;
  /** What Chat calls it while it stands. */
  readonly title: () => Message;
  /** What the program waits for, and that it is answered in the terminal. */
  readonly explanation: () => Message;
}

/** The wait a screen (an `AnsiScreen`'s rows, or a card excerpt's) shows for `program`, or null. */
export function terminalWaitOn(
  program: string | null | undefined,
  rows: readonly { readonly text: string }[],
): TerminalWait | null {
  const known = CHAT_PROGRAMS.find((name) => name === program);
  const waits = known ? programDefinition(known).terminalWaits?.() : undefined;
  if (!waits || waits.length === 0) return null;
  const texts = rows.map((row) => row.text.trim()).filter((text) => text !== '');
  return waits.find((wait) => wait.shows(texts)) ?? null;
}
