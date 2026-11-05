// Pi and Oh My Pi on the send side. Filled in by P2.10b phase 2 (Swift: ChatSendProfile `.pi`/`.omp`,
// ChatSendRules.ompRefusal, PiInputBoxDetector, the compaction rows of AgentChatStore+SendWitness).

import { conservativeSendPolicy } from '../send/defaults';
import type { ProgramSendPolicy } from '../send/policy';

export function piSendPolicy(program: 'pi' | 'omp'): ProgramSendPolicy {
  return conservativeSendPolicy(program, program === 'omp' ? 'Oh My Pi' : 'Pi');
}
