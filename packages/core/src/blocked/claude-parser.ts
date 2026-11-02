import { ClaudeContext } from './claude-context';
import { hasClaudeInputBox, locateOptionBlock } from './claude-models';
import { readClaudeDialog } from './claude-reader';
import { readClaudeLooseDialog, readClaudeTrustDialog } from './claude-special';
import type { AnsiScreen } from './screen';
import { type DialogParseResult, NO_DIALOG } from './types';

/**
 * Reads Claude Code's permission, plan, question and folder-trust dialogs from a visible-screen
 * read. Anything that does not fit a known dialog comes back as an excerpt for the generic card,
 * never as a guess.
 */
export function parseClaudeDialog(screen: AnsiScreen): DialogParseResult {
  if (hasClaudeInputBox(screen)) return NO_DIALOG;
  const trust = readClaudeTrustDialog(screen);
  if (trust) return trust;
  const block = locateOptionBlock(screen);
  if (!block) return readClaudeLooseDialog(screen);
  return readClaudeDialog(new ClaudeContext(screen, block));
}
