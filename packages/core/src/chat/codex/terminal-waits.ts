// What Codex waits on in its terminal, and what Chat says about herdr's hook. Codex 0.167 holds a new
// pane on "Hooks need review" until the user trusts a new or changed hook (goldens/codex/lab
// hooks-review): herdr's SessionStart hook, which reports the conversation, does not run before.

import { message } from '../../errors/text';
import type { TerminalWait } from '../programs/terminal-waits';

const HOOK_REVIEW_TITLE = 'Hooks need review';
/** The rows under the title that make it the review screen, not a sentence that mentions it. */
const HOOK_REVIEW_DETAIL = [/\bhooks? (?:is|are) new or changed\b/u, /\bTrust all and continue\b/u];

export const CODEX_HOOK_REVIEW: TerminalWait = {
  id: 'codexHookReview',
  shows: (rows) =>
    rows.includes(HOOK_REVIEW_TITLE) &&
    HOOK_REVIEW_DETAIL.some((detail) => rows.some((row) => detail.test(row))),
  title: () => message("Codex Asks to Review herdr's Hook"),
  explanation: () =>
    message(
      "Codex is waiting for you to review herdr's hook, which reports this conversation to Chat. Answer it in the terminal: Trust all and continue, or review it there. Chat shows the conversation once Codex reports it.",
    ),
};

export const CODEX_TERMINAL_WAITS: readonly TerminalWait[] = [CODEX_HOOK_REVIEW];

export const codexNotReportingMessage = () =>
  message(
    "Codex took your prompt, but herdr's hook hasn't reported the conversation. Codex runs a new hook only once you trust it: in the terminal, run /hooks and trust herdr's hook.",
  );

export const codexSetupNote = () =>
  message(
    "Codex asks you to trust herdr's hook the first time it starts with it: choose Trust all and continue, or run /hooks. Until then Chat can't show its conversation.",
  );
