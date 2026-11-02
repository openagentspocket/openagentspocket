import { CodexDialogReader } from './codex-reader';
import type { AnsiScreen } from './screen';
import type { DialogParseResult } from './types';

export function parseCodexDialog(screen: AnsiScreen): DialogParseResult {
  return new CodexDialogReader(screen).read();
}
