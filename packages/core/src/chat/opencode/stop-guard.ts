// Whether Chat's Stop may press OpenCode 2.0.32's two Escs on the screen it read (Swift
// OpenCodeStopGuard). On the conversation's input box while a turn runs, the first Esc arms the
// interrupt and the second interrupts; on a screen already armed, the first interrupts and the
// second only arms again. Elsewhere Esc does something else: it rejects a permission, dismisses a
// question, closes a menu or leaves shell mode. A draft doesn't stop it, because the interrupt
// leaves the box as it is.

import { parseOpenCodeDialog } from '../../blocked/opencode-parser';
import type { StopContext, StopVerdict } from '../send/policy';
import { readOpenCodeScreen } from './screen-reader';

const refuse = (reason: string): StopVerdict => ({ kind: 'refuse', reason });

export function openCodeStopGuard(context: StopContext): StopVerdict {
  if (context.activity !== 'working') {
    return refuse('The turn already ended, so Stop pressed nothing.');
  }
  // herdr may not report Blocked yet.
  const parsed = parseOpenCodeDialog(context.screen);
  if (parsed.kind === 'dialog' || parsed.kind === 'unrecognized') {
    return refuse(
      'OpenCode is asking for an answer, and Esc would reject it. Answer the card, or stop in the terminal.',
    );
  }
  const screen = readOpenCodeScreen(context.screen);
  if (screen.route !== 'session') {
    return refuse(
      "OpenCode isn't showing this conversation's prompt, so Stop pressed nothing. Stop it in the terminal.",
    );
  }
  if (screen.overlayTitle !== null) {
    return refuse(
      "A menu is open over OpenCode's prompt, and Esc would only close it. Close it in the terminal first.",
    );
  }
  if (screen.state.kind === 'shellMode') {
    return refuse(
      "OpenCode's prompt is in shell mode, where Esc only leaves it. Stop it in the terminal.",
    );
  }
  if (!screen.isRunning) {
    return refuse("OpenCode's screen shows no running turn, so Stop pressed nothing.");
  }
  return { kind: 'press' };
}
