// Grok Build on the send side. Filled in by P2.10b phase 2 (Swift: ChatSendProfile `.grok`,
// GrokSlashCommands, GrokInputBoxDetector, GrokScreen, GrokSessionCheck, GrokStopGuard,
// GrokPromptHistoryWitness).

import { conservativeSendPolicy } from '../send/defaults';
import type { ProgramSendPolicy } from '../send/policy';

export function grokSendPolicy(): ProgramSendPolicy {
  return conservativeSendPolicy('grok', 'Grok Build', { terminalStop: false });
}
