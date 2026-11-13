// Claude Code on the send side (Swift ChatSendProfile, ChatCommandMenu.offers, ChatStopPlan and
// InputBoxStateDetector for `.claude`): the first implementation of ProgramSendPolicy.

import type { ProgramSendPolicy } from '../send/policy';
import { ESCAPE_STOP } from '../send/stop-plan';
import { readClaudeInputBox } from './input-box';

/** Claude Code runs `/exit` for these whole inputs. */
const EXIT_WORDS: ReadonlySet<string> = new Set(['exit', 'quit', ':q', ':q!', ':wq', ':wq!']);

export const claudeSendPolicy: ProgramSendPolicy = {
  program: 'claude',
  chatName: 'Claude Code',
  profile: { exitWords: EXIT_WORDS },
  // Claude Code answers "Unknown command" for a skill marked `user-invocable: false`.
  offersSkill: (skill) => skill.isUserInvocable,
  echoesByEntry: false,
  echoClockStopsWhileWorking: false,
  writesNewConversationWithFirstReply: false,
  recordsCompactionBeforeNextPrompt: false,
  stopReturnsUntakenSends: false,
  // A message sent mid-turn is recorded as an enqueue, then delivered as a `queued_command` inside
  // the running turn, or as a `queued` prompt when the turn ended first (claude/prompts.ts).
  whileWorking: 'queuesForNextStep',
  mayRefillInputBoxAfterSend: false,
  readInputBox: readClaudeInputBox,
  textHoldReason: "The Agent's input box already has text. Send or clear it in the terminal first.",
  terminalStop: true,
  stop: ESCAPE_STOP,
};
