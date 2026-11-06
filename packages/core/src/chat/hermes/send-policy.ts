// Hermes Agent on the send side, read from its source. Enter while a turn runs interrupts that turn
// by default, so Chat sends only into an idle box. Esc does not interrupt: Ctrl+C does, once the box
// is empty, and a second one within two seconds force-quits, so Stop waits longer than that. On an
// idle Hermes Ctrl+C exits, which is why its guard reads the screen first.

import type { AnsiScreen } from '../../blocked/screen';
import { conservativeSendPolicy } from '../send/defaults';
import { emptyBox, type InputBoxState } from '../send/input-box';
import type { ProgramSendPolicy, StopContext, StopVerdict } from '../send/policy';
import { readHermesPrompt } from './screen';

/** Hermes exits for these whole inputs. */
const EXIT_WORDS: ReadonlySet<string> = new Set(['exit', 'quit']);

const refuse = (reason: string): StopVerdict => ({ kind: 'refuse', reason });

export function readHermesInputBox(screen: AnsiScreen): InputBoxState {
  const prompt = readHermesPrompt(screen);
  if (prompt === null) {
    return { kind: 'unknown', reason: "Agentico can't read Hermes Agent's input box here." };
  }
  if (prompt.draft !== '') return { kind: 'text', text: prompt.draft };
  if (prompt.isWorking) {
    return {
      kind: 'noComposer',
      reason:
        'Hermes Agent is working, and a message now would interrupt the turn. Wait for it, or use the terminal.',
    };
  }
  return emptyBox(prompt.placeholder);
}

export function hermesStopGuard({ activity, screen }: StopContext): StopVerdict {
  if (activity !== 'working') return refuse('The turn already ended, so Stop pressed nothing.');
  const prompt = readHermesPrompt(screen);
  if (prompt?.isWorking !== true) {
    return refuse("Hermes Agent's screen shows no running turn, so Stop pressed nothing.");
  }
  if (prompt.draft !== '') {
    return refuse("Ctrl+C would clear the draft in Hermes Agent's box. Stop it in the terminal.");
  }
  return { kind: 'press' };
}

export function hermesSendPolicy(): ProgramSendPolicy {
  return conservativeSendPolicy('hermes', 'Hermes Agent', {
    profile: { exitWords: EXIT_WORDS },
    // A send can stay unrecorded while the turn runs: the echo times out on idle time only.
    echoClockStopsWhileWorking: true,
    readInputBox: readHermesInputBox,
    terminalStop: false,
    stop: {
      keys: ['ctrl+c'],
      screenGuard: hermesStopGuard,
      wait: {
        windowMs: 3000,
        unconfirmedNotice: 'Ctrl+C went, but the Agent still shows Working.',
        minimumGapMs: 2500,
      },
      accessibilityHint: 'Presses Ctrl+C to interrupt the turn',
    },
  });
}
