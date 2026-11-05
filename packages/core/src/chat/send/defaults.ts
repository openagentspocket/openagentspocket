// The conservative policy a program gets until it has its own: the shared rules with no exit words,
// no skills in the menu, an Esc Stop, and an input box it never claims to recognize (so nothing is
// sent into it). Program send policies spread this and override what their program does.

import type { ChatProgram } from '../model/types';
import type { ProgramSendPolicy } from './policy';
import { ESCAPE_STOP } from './stop-plan';

export function conservativeSendPolicy(
  program: ChatProgram,
  chatName: string,
  overrides: Partial<ProgramSendPolicy> = {},
): ProgramSendPolicy {
  return {
    program,
    chatName,
    profile: { exitWords: new Set() },
    offersSkill: () => false,
    echoesByEntry: false,
    echoClockStopsWhileWorking: false,
    writesNewConversationWithFirstReply: false,
    recordsCompactionBeforeNextPrompt: false,
    stopReturnsUntakenSends: false,
    mayRefillInputBoxAfterSend: false,
    readInputBox: () => ({
      kind: 'unknown',
      reason: `Agentico can't read ${chatName}'s input box yet.`,
    }),
    textHoldReason:
      "The Agent's input box already has text. Send or clear it in the terminal first.",
    terminalStop: true,
    stop: ESCAPE_STOP,
    ...overrides,
  };
}
