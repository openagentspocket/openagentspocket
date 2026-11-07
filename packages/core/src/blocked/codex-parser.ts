import { CodexDialogReader } from './codex-reader';
import { CODEX_POINTER } from './row-scanner';
import type { AnsiScreen } from './screen';
import { withoutSidePanel } from './side-panel';
import type { DialogParseResult } from './types';

export function parseCodexDialog(screen: AnsiScreen): DialogParseResult {
  return new CodexDialogReader(withoutSidePanel(screen, CODEX_POINTER)).read();
}
