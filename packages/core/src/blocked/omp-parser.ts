// Reads Oh My Pi's dialog panels from a visible-screen read (Swift OMPDialogParser).
//
// OMP draws a dialog as a rounded panel titled in its top border, with `├─…┤` rules between its
// sections and its key hints in the last one. The panel is either the screen's last row (a question
// without a draft replaces the composer, the plan review fills the screen) or rests directly on the
// status band, whose `╰─` prompt stays below it (an approval, or a question while the prompt holds a
// draft). Tool renderings in the history are panels too, but untitled (`╭───╮`) or with a rule
// before the title (`╭─── Ask 1 questions`), and never touch the band. A tool approval and a
// single-select question are known dialogs; any other titled panel holds sending as an excerpt for
// the generic card. OMP binds no digits, so the excerpt offers none.

import { message } from '../errors/text';
import { ask } from './omp-ask';
import { bottomPanel, type OmpLine, type OmpPanel } from './omp-panel';
import { dialogResult, pointed, unrecognized } from './omp-result';
import { type AnsiScreen, trimBlanks } from './screen';
import { type DialogOption, type DialogParseResult, makeOption, makeSubject } from './types';

const APPROVAL_PREFIX = 'Allow tool:';
const DENY_AND_SEND = 'Deny and send message';

export function parseOmpDialog(screen: AnsiScreen): DialogParseResult {
  const panel = bottomPanel(screen);
  if (!panel) return { kind: 'none' };
  const { title } = panel;
  if (title === null) {
    return unrecognized(panel, screen, message("The top of Oh My Pi's panel is off screen."));
  }
  if (title.startsWith(APPROVAL_PREFIX)) return approval(panel, title, screen);
  if (title === 'Ask') return ask(panel, screen);
  return unrecognized(
    panel,
    screen,
    message("Agentico does not know Oh My Pi's “%@” panel.", title),
  );
}

interface ApprovalChoices {
  /** How many of the details' last rows the list takes. */
  rows: number;
  /** The session row's label as printed. */
  sessionLabel: string | null;
  /** The pointer's row, 1-based. */
  focused: number;
}

/**
 * Oh My Pi 18.12's choices, the details' last rows: `Approve`, then `Approve <subject> for this
 * session` when the approval policy offers it, then `Deny`, which reads `Deny and send message`
 * while the prompt holds a draft. The pointer leads the focused row, the others are indented to its
 * label, and up/down wrap around. While a draft is typed the pointer stays on Deny and arrow keys
 * edit the draft.
 */
function approvalChoices(lines: readonly OmpLine[]): ApprovalChoices | null {
  for (const count of [3, 2]) {
    if (lines.length < count) continue;
    const rows = lines.slice(-count);
    const read = rows.flatMap((line) => {
      const value = pointed(line.text);
      return value ? [value] : [];
    });
    if (read.length !== count) continue;
    const focused = read.findIndex((value) => value.isFocused);
    if (focused < 0 || read.filter((value) => value.isFocused).length !== 1) continue;
    const focusedRow = rows[focused] as OmpLine;
    if (!rows.every((row, at) => at === focused || row.indent === focusedRow.indent + 2)) continue;
    const deny = (read[read.length - 1] as { rest: string }).rest;
    if (
      (read[0] as { rest: string }).rest !== 'Approve' ||
      (deny !== 'Deny' && deny !== DENY_AND_SEND)
    ) {
      continue;
    }
    if (count === 2) return { rows: 2, sessionLabel: null, focused: focused + 1 };
    const session = (read[1] as { rest: string }).rest;
    if (!session.startsWith('Approve ') || !session.endsWith(' for this session')) continue;
    return { rows: 3, sessionLabel: session, focused: focused + 1 };
  }
  return null;
}

const valueAfter = (label: string, body: readonly string[]): string | null => {
  const found = body.find((line) => line.startsWith(label));
  return found === undefined ? null : trimBlanks(found.slice(label.length));
};

/**
 * `Allow tool: <name>`, its details (`Command:`, `Reason:`, `Origin:` and per-tool rows), then
 * `ctrl+q approve · esc deny · …`. Typing goes to the prompt below, which turns the footer's tail
 * into `deny and send`, so the footer stays out of the fingerprint. Before 18.12 plain Enter does
 * nothing; 18.12 lists the choices under the details, which arrow keys and Enter answer.
 */
function approval(panel: OmpPanel, title: string, screen: AnsiScreen): DialogParseResult {
  const footer = panel.sections[panel.sections.length - 1];
  const keysMissing = () =>
    unrecognized(panel, screen, message("The approval's keys are not on screen."));
  if (panel.sections.length <= 1 || !footer) return keysMissing();
  const keys = footer.map((line) => line.text).join(' ');
  if (!keys.includes(' approve') || !keys.includes(' deny')) return keysMissing();
  const details = panel.sections.slice(0, -1).flat();
  const choices = approvalChoices(details);
  const body = details.slice(0, details.length - (choices?.rows ?? 0)).map((line) => line.text);
  const subject = makeSubject();
  subject.toolName = trimBlanks(title.slice(APPROVAL_PREFIX.length));
  const command = valueAfter('Command:', body);
  // A command too long for its row ends in `…`.
  subject.command = command?.endsWith('…') ? trimBlanks(command.slice(0, -1)) : command;
  subject.reason = valueAfter('Reason:', body);
  // OMP ignores ctrl+q and Enter for 500 ms after drawing the panel; the store waits that out.
  // ctrl+enter reads as Enter without kitty keys. The options follow the list's order, so an
  // ordinal is its row; a draft hides the list's focus behind its Deny row.
  const isGuarded = keys.includes('deny and send');
  const focused = isGuarded ? null : (choices?.focused ?? null);
  const options: DialogOption[] = [
    makeOption({
      ordinal: 1,
      number: null,
      label: 'Approve',
      shortcut: 'ctrl+q',
      role: 'approve',
      isFocused: focused === 1,
    }),
  ];
  if (choices?.sessionLabel) {
    options.push(
      makeOption({
        ordinal: 2,
        number: null,
        label: choices.sessionLabel,
        role: 'approvePersistent',
        isFocused: focused === 2,
      }),
    );
  }
  options.push(
    makeOption({
      ordinal: options.length + 1,
      number: null,
      label: 'Deny',
      shortcut: 'esc',
      role: 'decline',
      isFocused: focused === options.length + 1,
    }),
  );
  return dialogResult(
    panel,
    'ompApproval',
    title,
    body,
    null,
    options,
    focused,
    isGuarded,
    subject,
  );
}
