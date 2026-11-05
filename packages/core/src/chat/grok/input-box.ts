// Reads Grok Build's input box from a screen (Swift GrokInputBoxDetector, ADR 0024). Only an empty
// composer with prompt focus, or under the Welcome view, reads empty; ghost text never counts as
// typed. Every other state carries the reason Chat holds a message with. The dashboard's view of an
// agent shows that agent's own box, read the same way; whose agent it is, the session check reads.

import type { AnsiScreen } from '../../blocked/screen';
import { emptyBox, type InputBoxState } from '../send/input-box';
import { composerIsEditingQueued, composerIsMultiline, readGrokScreen } from './screen';

export const GROK_DASHBOARD_REASON =
  'Grok Build is showing its dashboard, where a message starts a new agent. Go back to the conversation in the terminal first.';
export const GROK_MINIMAL_REASON =
  "Grok Build is in minimal mode, which Chat can't read. Switch back with /fullscreen in the terminal.";
export const GROK_NO_BOX_REASON = "Agentico can't find Grok Build's input box on screen.";
export const GROK_MULTILINE_REASON =
  'Grok Build is in /multiline mode, where Enter adds a line instead of sending. Turn it off in the terminal with /multiline.';
export const GROK_EDITING_QUEUED_REASON =
  'Grok Build is editing a queued message. Finish it in the terminal first.';
export const GROK_REMEMBER_REASON =
  "Grok Build's input box is in remember mode, where a message is saved as a memory. Leave it in the terminal first.";
export const GROK_SENDABLE_WAIT_REASON =
  'Grok Build is waiting on a subagent or a background task, and a message now would cancel that turn.';
export const GROK_UNFOCUSED_REASON =
  "Grok Build's input box doesn't have focus. Go back to it in the terminal, then send again.";

export function readGrokInputBox(screen: AnsiScreen): InputBoxState {
  const grok = readGrokScreen(screen);
  if (grok.isDashboard) return { kind: 'noComposer', reason: GROK_DASHBOARD_REASON };
  if (grok.overlay !== null) return { kind: 'overlay', row: grok.overlay };
  if (grok.pendingDoublePress !== null) {
    return {
      kind: 'disabled',
      reason: `Grok Build is waiting for a second key press (“${grok.pendingDoublePress}”). Wait a second, then send again.`,
    };
  }
  const { composer } = grok;
  if (composer === null) {
    return grok.isMinimal
      ? { kind: 'disabled', reason: GROK_MINIMAL_REASON }
      : { kind: 'unknown', reason: GROK_NO_BOX_REASON };
  }
  if (composerIsMultiline(composer)) return { kind: 'disabled', reason: GROK_MULTILINE_REASON };
  if (composerIsEditingQueued(composer)) {
    return { kind: 'disabled', reason: GROK_EDITING_QUEUED_REASON };
  }
  if (composer.mode === 'bash') return { kind: 'shellMode', command: composer.draft };
  if (composer.mode === 'remember') return { kind: 'disabled', reason: GROK_REMEMBER_REASON };
  if (composer.draft !== '') return { kind: 'text', text: composer.draft };
  if (grok.sendableWait) return { kind: 'disabled', reason: GROK_SENDABLE_WAIT_REASON };
  // Grok queues a message while a turn runs, and the Welcome view's composer sends. Without prompt
  // focus a paste goes elsewhere, and Enter on a queued row sends that row now.
  if (grok.isWelcome || grok.promptHasFocus) return emptyBox(null);
  return { kind: 'disabled', reason: GROK_UNFOCUSED_REASON };
}
