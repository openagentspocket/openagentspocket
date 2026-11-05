// OpenCode on the send side (Swift ChatSendProfile `.opencode`, ChatCommandMenu.offers, ChatStopPlan,
// InputBoxStateDetector, `confirmsSessionBeforeSend`): its exit words, its bare `/compact`, no skills
// in the menu, an input box read from the screen, a double-Esc Stop behind a screen guard, and the
// terminal title that says which conversation its TUI shows.

import { conservativeSendPolicy } from '../send/defaults';
import type { CommandSubmission, ProgramSendPolicy } from '../send/policy';
import { readOpenCodeScreen } from './screen-reader';
import { openCodeRefusal } from './send-rules';
import { openCodeStopGuard } from './stop-guard';
import { openCodeTerminalTitle } from './terminal-title';

/** OpenCode exits for `exit`, `quit` and `:q` as typed; Claude Code's words, compared in any case, cover them. */
const EXIT_WORDS: ReadonlySet<string> = new Set(['exit', 'quit', ':q', ':q!', ':wq', ':wq!']);

/** OpenCode runs a bare `/compact` from its popup. With a space after it, the popup closes and the text goes to the model. */
const COMPACT_BARE: CommandSubmission = {
  kind: 'bare',
  argumentsRefusal: "OpenCode's /compact takes no instructions. Send /compact alone.",
};

/** OpenCode's interrupt resumes: a message waiting during the turn runs after it. */
const UNCONFIRMED_NOTICE =
  'Esc went twice, but OpenCode still shows Working. If a message was waiting during this turn, OpenCode runs it after a stop; tap Stop again to stop that too. In the terminal, use Esc, not Ctrl+C, which exits OpenCode when its input is empty.';

export function openCodeSendPolicy(): ProgramSendPolicy {
  return conservativeSendPolicy('opencode', 'OpenCode', {
    profile: {
      exitWords: EXIT_WORDS,
      refusal: openCodeRefusal,
      submission: (command) =>
        command.kind.type === 'compact' ? COMPACT_BARE : { kind: 'trailingSpace' },
    },
    // Its skills have no form a message can invoke, and its server commands are not offered.
    offersSkill: () => false,
    echoesByEntry: true,
    // Its compaction rows, then the turn's end, are recorded before the next prompt.
    recordsCompactionBeforeNextPrompt: true,
    readInputBox: (screen) => readOpenCodeScreen(screen).state,
    // `/undo` puts the undone prompt back in the box, and Up recalls an earlier one.
    textHoldReason:
      "The Agent's input box already has text, such as a draft, a prompt /undo put back, or one recalled with Up. Send or clear it in the terminal first.",
    terminalStop: true,
    stop: {
      keys: ['esc', 'esc'],
      screenGuard: openCodeStopGuard,
      wait: { windowMs: 3000, unconfirmedNotice: UNCONFIRMED_NOTICE },
      accessibilityHint: 'Presses Esc twice to interrupt OpenCode',
    },
    terminalTitle: openCodeTerminalTitle,
    // After `/new` herdr keeps reporting the conversation OpenCode left for its home screen.
    confirmsSessionBeforeSend: true,
    leavesSessionWithoutReport: true,
    screenRoute: (screen) => {
      const { route } = readOpenCodeScreen(screen);
      return route === 'home' || route === 'session' ? route : 'other';
    },
  });
}
