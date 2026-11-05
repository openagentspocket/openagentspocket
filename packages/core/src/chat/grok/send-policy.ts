// Grok Build on the send side (Swift ChatSendProfile `.grok`, ChatCommandMenu.offers, ChatStopPlan,
// GrokInputBoxDetector, GrokSessionCheck, GrokPromptHistoryWitness and the adapter's echo clock).

import type { ProgramSendPolicy } from '../send/policy';
import { readGrokInputBox } from './input-box';
import {
  GROK_BUILT_INS,
  grokSlashRefusal,
  promptHistoryEntry,
  promptHistoryPath,
} from './send-rules';
import { grokSessionVerdict } from './session-check';
import { grokStopVerdict } from './stop-guard';

/** Grok Build quits at once for these whole inputs. */
const EXIT_WORDS: ReadonlySet<string> = new Set(['exit', 'quit', ':q', ':q!', ':wq', ':wq!']);

export function grokSendPolicy(): ProgramSendPolicy {
  return {
    program: 'grok',
    chatName: 'Grok Build',
    // It reads `/btw` and `/goal` anywhere in a message and trims the trailing space before it
    // parses a command.
    profile: {
      exitWords: EXIT_WORDS,
      refusal: (clean, trimmed) => grokSlashRefusal(clean, trimmed) ?? undefined,
    },
    // Grok doesn't offer a skill as a command unless user-invocable, and keeps its built-in names
    // in any case: a skill named like one is offered only under a qualified name.
    offersSkill: (skill) => skill.isUserInvocable && !GROK_BUILT_INS.has(skill.name.toLowerCase()),
    echoesByEntry: false,
    // A send can stay unrecorded while the turn runs: the echo times out on idle time only.
    echoClockStopsWhileWorking: true,
    writesNewConversationWithFirstReply: false,
    recordsCompactionBeforeNextPrompt: false,
    stopReturnsUntakenSends: false,
    // It restores a draft stashed with Ctrl+S after the next send, so a draft is not necessarily the message.
    mayRefillInputBoxAfterSend: true,
    readInputBox: readGrokInputBox,
    textHoldReason:
      "The Agent's input box already has text. Send or clear it in the terminal first.",
    // Esc only shows a toast there; Stop is Ctrl+C (below), so the terminal's Esc Stop stays off.
    terminalStop: false,
    // Ctrl+C cancels Grok Build's turn; it can also clear a draft, answer a card or quit, so the
    // guard reads the screen first.
    stop: {
      keys: ['ctrl+c'],
      screenGuard: grokStopVerdict,
      wait: {
        windowMs: 3000,
        unconfirmedNotice:
          'Ctrl+C went, but the Agent still shows Working. A queued message may have started.',
        minimumGapMs: 1500,
      },
      accessibilityHint: 'Presses Ctrl+C to cancel the turn',
    },
    sessionCheck: grokSessionVerdict,
    // `<group>/prompt_history.jsonl`: every prompt Grok submits, naming the session that took it.
    sendWitness: { logPath: promptHistoryPath, entry: promptHistoryEntry },
  };
}
