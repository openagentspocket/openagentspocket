// Which conversation OpenCode 2.0.32's terminal title says its TUI shows (`tui/src/app.tsx`;
// Swift OpenCodeTerminalTitle). OpenCode writes `OpenCode` on its home screen and for a conversation
// it has not titled, `OC | ` and the conversation's title otherwise, or the route's name on a
// plugin's route, and nothing at all while its `terminal.title` setting is off, when the pane keeps
// the title it had.

import type { TerminalTitleCheck, TerminalTitleVerdict } from '../send/policy';

/** The title on the home screen and for an untitled conversation. */
export const OPENCODE_UNTITLED_TITLE = 'OpenCode';
const PREFIX = 'OC | ';
/** The timestamped title OpenCode gives a conversation until it names it. */
const FALLBACK = /^(New|Child) session - \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

/**
 * The title OpenCode writes while it shows a conversation titled `sessionTitle`. One past 40 UTF-16
 * units keeps its first 37 and an ellipsis; a surrogate pair split there becomes U+FFFD, as Bun
 * writes it.
 */
export function expectedOpenCodeTitle(sessionTitle: string | null): string {
  if (sessionTitle === null || sessionTitle === '' || FALLBACK.test(sessionTitle)) {
    return OPENCODE_UNTITLED_TITLE;
  }
  if (sessionTitle.length <= 40) return PREFIX + sessionTitle;
  const cut = sessionTitle.slice(0, 37);
  const last = cut.charCodeAt(cut.length - 1);
  const whole = last >= 0xd800 && last <= 0xdbff ? `${cut.slice(0, -1)}�` : cut;
  return `${PREFIX}${whole}…`;
}

/** `OpenCode` never matches, even for an untitled conversation: the home screen writes it too. */
export function openCodeTitleVerdict(
  terminalTitle: string | null,
  sessionTitle: string | null,
): TerminalTitleVerdict {
  if (terminalTitle === null || terminalTitle === OPENCODE_UNTITLED_TITLE) {
    return { kind: 'saysNothing' };
  }
  if (terminalTitle === expectedOpenCodeTitle(sessionTitle)) return { kind: 'matches' };
  if (!terminalTitle.startsWith(PREFIX)) return { kind: 'saysNothing' };
  return { kind: 'differs', title: terminalTitle.slice(PREFIX.length) };
}

export const openCodeTerminalTitle: TerminalTitleCheck = {
  verdict: openCodeTitleVerdict,
  expected: expectedOpenCodeTitle,
  untitled: OPENCODE_UNTITLED_TITLE,
};
