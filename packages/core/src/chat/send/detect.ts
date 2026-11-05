// Reading the Agent's input box from a screen (Swift InputBoxStateDetector): a dialog in the box's
// place is found by the program's Blocked parser, everything else by the program's own reader.

import { parseBlockedDialog } from '../../blocked/programs';
import type { AnsiScreen } from '../../blocked/screen';
import type { InputBoxState } from './input-box';
import type { ProgramSendPolicy } from './policy';

export function detectInputBox(screen: AnsiScreen, policy: ProgramSendPolicy): InputBoxState {
  const parsed = parseBlockedDialog(screen, policy.program);
  if (parsed.kind === 'dialog' || parsed.kind === 'unrecognized') {
    // herdr may report an Agent idle under a selector no card names; the hold does.
    return { kind: 'dialog', title: policy.dialogTitle?.(screen) ?? null };
  }
  return policy.readInputBox(screen);
}

/** Why Chat holds a message while the input box reads this way. Every case is one the terminal can resolve. */
export function holdReason(state: InputBoxState, policy: ProgramSendPolicy): string {
  switch (state.kind) {
    case 'empty':
      return "The Agent's input box is ready.";
    case 'text':
      return policy.textHoldReason;
    case 'shellMode':
      return "The Agent's input box is in shell mode. Leave it in the terminal first.";
    case 'disabled':
      return `The Agent isn't taking messages: ${state.reason}`;
    case 'overlay':
      return "A menu is open over the Agent's input box. Close it in the terminal first.";
    case 'dialog':
      return (
        policy.dialogHoldReason?.(state.title) ??
        'The Agent is showing a dialog. Answer it in the terminal first.'
      );
    case 'noComposer':
      return state.reason;
    case 'unknown':
      return "Agentico can't find the Agent's input box on screen.";
  }
}
