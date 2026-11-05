// OpenCode on the send side. Filled in by P2.10b phase 2 (Swift: ChatSendProfile `.opencode`,
// OpenCodeSendRules, OpenCodeScreenReader, OpenCodeStopGuard, OpenCodeTerminalTitle).

import { conservativeSendPolicy } from '../send/defaults';
import type { ProgramSendPolicy } from '../send/policy';

export function openCodeSendPolicy(): ProgramSendPolicy {
  return conservativeSendPolicy('opencode', 'OpenCode');
}
