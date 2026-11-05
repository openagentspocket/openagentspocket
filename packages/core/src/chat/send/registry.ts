// The send policy of each program, next to its ChatTranscriptAdapter (chat/engine/adapter.ts) and
// its BlockedProgramSupport (blocked/programs.ts). Every send-side engine asks here; none names a
// program.

import { programIdentity } from '../../programs';
import { claudeSendPolicy } from '../claude/send-policy';
import { codexSendPolicy } from '../codex/send-policy';
import { grokSendPolicy } from '../grok/send-policy';
import type { ChatProgram } from '../model/types';
import { openCodeSendPolicy } from '../opencode/send-policy';
import { piSendPolicy } from '../pi/send-policy';
import type { ProgramSendPolicy } from './policy';

const registry = new Map<ChatProgram, ProgramSendPolicy>([
  ['claude', claudeSendPolicy],
  ['codex', codexSendPolicy],
  ['pi', piSendPolicy('pi')],
  ['omp', piSendPolicy('omp')],
  ['grok', grokSendPolicy()],
  ['opencode', openCodeSendPolicy()],
]);

/** Adds or replaces a program's send policy (tests, and programs added later). */
export function registerSendPolicy(policy: ProgramSendPolicy): void {
  registry.set(policy.program, policy);
}

/** The send policy of a Chat program; every program has one. */
export function sendPolicyFor(program: ChatProgram): ProgramSendPolicy {
  return registry.get(program) as ProgramSendPolicy;
}

/** The send policy for the program herdr names an Agent by; null for a program Chat does not know. */
export function sendPolicyForAgent(reported: string): ProgramSendPolicy | null {
  const kind = programIdentity(reported).kind;
  return kind ? (registry.get(kind as ChatProgram) ?? null) : null;
}

/** Whether the terminal Composer shows Stop for an Agent of `kind`: one Esc, or none where Esc does not interrupt (Grok Build). */
export function terminalStopAvailable(kind: string): boolean {
  return sendPolicyForAgent(kind)?.terminalStop ?? true;
}
