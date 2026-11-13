// The mode an Agent's screen names, for every program that lists its modes. The mode sits on the
// footer under the input box, and a dialog in the box's place (an approval, a question) covers it:
// then the screen names no mode, and the last one read stands rather than a guess.

import { parseBlockedDialog } from '../../blocked/programs';
import { type AnsiScreen, screenText } from '../../blocked/screen';
import type { Message } from '../../errors/text';
import { CHAT_PROGRAMS } from '../model/types';
import { readProgramMode } from './modes';
import { programModes } from './registry';

/** True while a dialog the program's Blocked parser sees (named or not) covers the footer. */
export function footerCovered(program: string | null | undefined, screen: AnsiScreen): boolean {
  const known = CHAT_PROGRAMS.find((name) => name === program);
  return known !== undefined && parseBlockedDialog(screen, known).kind !== 'none';
}

/**
 * The Agent's mode from `screen`; `last` (the mode read before) while a dialog covers the footer.
 * Null for a program that names no modes.
 */
export function readAgentMode(
  program: string | null | undefined,
  screen: AnsiScreen,
  last: Message | null,
): Message | null {
  const modes = programModes(program);
  if (!modes) return null;
  if (footerCovered(program, screen)) return last;
  return readProgramMode(modes, screenText(screen));
}
