// Codex on the send side (Swift ChatSendProfile, ChatCommandMenu.offers, ChatStopPlan and
// InputBoxStateDetector for `.codex`).

import { CODEX_PLAN_PROMPT_TITLE } from '../../blocked/codex-extras';
import type { ProgramSendPolicy } from '../send/policy';
import { ESCAPE_STOP } from '../send/stop-plan';
import { codexDialogTitle, readCodexInputBox } from './input-box';

export const codexSendPolicy: ProgramSendPolicy = {
  program: 'codex',
  chatName: 'Codex',
  profile: { exitWords: new Set() },
  offersSkill: () => true,
  echoesByEntry: false,
  echoClockStopsWhileWorking: false,
  writesNewConversationWithFirstReply: false,
  recordsCompactionBeforeNextPrompt: false,
  stopReturnsUntakenSends: false,
  mayRefillInputBoxAfterSend: false,
  readInputBox: readCodexInputBox,
  dialogTitle: codexDialogTitle,
  // Codex 0.162.1's Esc puts follow-ups queued with Tab back in the box.
  textHoldReason:
    "The Agent's input box already has text, such as a draft or a message Stop returned. Send or clear it in the terminal first.",
  dialogHoldReason: (title) =>
    title === CODEX_PLAN_PROMPT_TITLE
      ? 'Codex is asking whether to implement the plan. Answer it in the terminal first.'
      : undefined,
  terminalStop: true,
  stop: ESCAPE_STOP,
};
