// Whether Chat's Stop may press Ctrl+C in Grok Build (Swift GrokStopGuard, ADR 0024), decided on
// one fresh screen read and herdr's status. Ctrl+C cancels a running turn, but it also clears a
// draft, cancels a permission, skips a question, and quits Grok Build, at once or on a second
// press. So Stop presses only while a turn shows on the conversation's own view, with the prompt
// focused and empty and no second press pending. The first condition that fails says why nothing
// was pressed.

import type { StopContext, StopVerdict } from '../send/policy';
import { type GrokScreen, readGrokScreen } from './screen';

const ASKING =
  'Grok Build is asking something, so Stop pressed nothing. Answer it in Chat or the terminal.';
const NOT_WORKING =
  "Agentico can't see Grok Build working, so Stop pressed nothing. Stop it in the terminal with Ctrl+C.";
const DRAFT =
  "Grok Build's input box has text, and Ctrl+C would only clear it. Stop it in the terminal.";

const refuse = (reason: string): StopVerdict => ({ kind: 'refuse', reason });

/** Why Stop presses nothing while Grok waits for a second press or a cancel: Ctrl+C may confirm a pending quit. */
function pendingRefusal(grok: GrokScreen): string | null {
  if (grok.pendingDoublePress !== null) {
    return grok.pendingDoublePress.includes('press again to quit')
      ? 'Grok Build is waiting for a second key press to quit, so Stop pressed nothing.'
      : 'Grok Build is waiting for a second key press, so Stop pressed nothing.';
  }
  return grok.isCancelling ? 'Grok Build is already cancelling the turn.' : null;
}

export function grokStopVerdict(context: StopContext): StopVerdict {
  const grok = readGrokScreen(context.screen);
  // A card replaces the composer, and herdr reports it as Blocked a moment after it shows.
  if (context.activity === 'blocked' || grok.card !== null) return refuse(ASKING);
  if (context.activity !== 'working') return refuse(NOT_WORKING);
  // The dashboard's view of an agent passes Ctrl+C to whichever agent it shows, so the reason names
  // Ctrl+C in the terminal, unless Ctrl+C there would quit Grok Build or only clear a draft.
  if (grok.isDashboardOverlay) {
    const pending = pendingRefusal(grok);
    if (pending !== null) return refuse(pending);
    if (grok.composer !== null && grok.composer.draft !== '') return refuse(DRAFT);
    return refuse(
      'Grok Build is showing an agent from its dashboard, so Stop pressed nothing. Stop it in the terminal with Ctrl+C.',
    );
  }
  // Minimal mode draws no box either.
  const showsConversation = grok.overlay === null && !grok.isDashboard && !grok.isWelcome;
  const { composer } = grok;
  if (composer === null || composer.mode !== 'prompt' || !showsConversation) {
    return refuse(
      'Grok Build is showing a menu or another view, so Stop pressed nothing. Close it in the terminal first.',
    );
  }
  const pending = pendingRefusal(grok);
  if (pending !== null) return refuse(pending);
  // Grok offers the cancel in every pane while a turn runs.
  const offersCancel = grok.footer?.includes('Ctrl+c:cancel') === true;
  if (grok.statusRow === null && !offersCancel) return refuse(NOT_WORKING);
  // Ghost text is not a draft: with nothing typed, Ctrl+C cancels. A draft's own hints lead the
  // footer and push the focus hints past a phone's 62 columns, so the draft is checked first.
  if (composer.draft !== '') return refuse(DRAFT);
  if (!grok.promptHasFocus && !offersCancel) {
    return refuse(
      "Grok Build's input box doesn't have focus, so Stop pressed nothing. Stop it in the terminal.",
    );
  }
  return { kind: 'press' };
}
