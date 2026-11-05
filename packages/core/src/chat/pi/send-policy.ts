// Pi and Oh My Pi on the send side (Swift ChatSendProfile `.pi`/`.omp`, ChatCommandMenu.offers,
// PiInputBoxDetector, ChatStopPlan and the Pi flags of ChatProgram).

import { SKILL_COMMAND_PREFIX } from '../send/command-menu';
import type { ProgramSendPolicy } from '../send/policy';
import { ESCAPE_STOP } from '../send/stop-plan';
import { piCompaction } from './compaction';
import { readPiInputBox } from './input-box';
import { OMP_EXIT_WORDS, ompRefusal, ompSubmission } from './send-rules';

export function piSendPolicy(program: 'pi' | 'omp'): ProgramSendPolicy {
  const omp = program === 'omp';
  return {
    program,
    chatName: omp ? 'Oh My Pi' : 'Pi',
    profile: omp
      ? { exitWords: OMP_EXIT_WORDS, refusal: ompRefusal, submission: ompSubmission }
      : { exitWords: new Set() },
    // Only their `/skill:` skills: a prompt template is a plain `/name`, which runs the built-in
    // command instead when one shares its name.
    offersSkill: (skill) => skill.commandPrefix === SKILL_COMMAND_PREFIX,
    // A recorded prompt keeps its entry when OMP rewrites its file.
    echoesByEntry: true,
    echoClockStopsWhileWorking: false,
    writesNewConversationWithFirstReply: true,
    recordsCompactionBeforeNextPrompt: true,
    stopReturnsUntakenSends: true,
    compaction: piCompaction(program),
    mayRefillInputBoxAfterSend: false,
    readInputBox: (screen) => readPiInputBox(screen, program),
    // Their Esc returns steers the turn has not taken to the box, but the text may as well be a
    // draft typed there.
    textHoldReason:
      "The Agent's input box already has text, such as a draft or a steer that Stop returned. Send or clear it in the terminal first.",
    terminalStop: true,
    stop: ESCAPE_STOP,
  };
}
