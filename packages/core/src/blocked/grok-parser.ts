// Reads Grok Build's cards (1.0.62; Swift GrokDialogParser). A card takes the composer's place:
// rows behind a `┃` bar on a lighter background, each option a row `<key> (○) <label>` with any
// description two spaces or more after the label, and the card's own hints in the footer. Agentico
// knows four: a permission, which also asks before a subagent starts, a single question the agent
// asks during its turn, the worktree question `/fork` asks (every answer forks, and herdr's session
// stays on this one), and the panel Ctrl+C opens while subagents run. Any other card with options
// holds sending as an excerpt without numbers, so the generic card offers only its key pad.
//
// The cursor's row lies on a band of another background, or in reverse video under the terminal
// theme, its label bold. On a permission and on the subagent panel `(●)` marks the cursor too; on a
// question it marks a chosen answer. Esc hands the keyboard to the scrollback and leaves the card
// drawn without its band, and a key would then miss the card, so the cursor counts only while the
// footer shows the card's hints. A row's key selects that row wherever the cursor is, a row Agentico
// leaves to the terminal included, so the hints, not the cursor, say whether keys reach the card. A
// row too long for the card stops at its edge, and a label cut there still names the option it begins.

import { dialogFingerprint } from './fingerprint';
import {
  answerOption,
  answerSheet,
  FORK_QUESTION,
  FORK_ROWS,
  FREE_TEXT_KEY,
  freeTextOption,
  waitsOnAnswers,
} from './grok-answers';
import {
  GrokCard,
  type GrokLine,
  type GrokOption,
  optionBegins,
  optionNames,
  optionShortens,
} from './grok-card';
import { readGrokScreen } from './grok-screen';
import { type AnsiScreen, trimBlanks } from './screen';
import {
  type BlockedDialog,
  type BlockedDialogKind,
  type DialogOption,
  type DialogOptionRole,
  type DialogParseResult,
  type DialogSubject,
  makeOption,
  makeSubject,
  NO_DIALOG,
} from './types';

const UNKNOWN_REASON =
  "Agentico doesn't know this Grok Build card. Answer it with these keys or in the terminal.";
const OVERLAY_REASON =
  'Grok Build is showing this card for an agent from its dashboard, which may not be this conversation. Answer it with these keys or in the terminal.';
const QUESTION_REASON =
  'Agentico answers only a single question Grok Build asks during its turn. Answer this one with these keys or in the terminal.';
const FORK_REASON =
  "Grok Build's /fork asks this, and every answer forks. Always worktree and Never worktree also save a lasting choice. Answer in the terminal or with these keys.";
const FORK_HIDDEN_ROWS_REASON =
  "Grok Build's /fork asks this, and every answer forks. Always worktree and Never worktree, which this width hides, also save a lasting choice. Answer in the terminal or with these keys.";
const CUT_RULE_NOTE = 'Widen the terminal to see the lasting rule.';

const REJECT = 'No, reject (type to add feedback)';
const SEND_ONCE = 'Yes, send once';
const SESSION_EDITS = 'Yes, allow all edits during this session';
const ALWAYS_APPROVE = "Yes, and don't ask again for anything (always-approve mode)";

const CANCEL_TITLE = 'Subagents are still running. Stop them?';

const trimmed = (text: string) => trimBlanks(text);
const dropFirst = (text: string) => [...text].slice(1).join('');

interface DialogParts {
  kind: BlockedDialogKind;
  title: string;
  body: string[];
  options: DialogOption[];
  card: GrokCard;
  subject: DialogSubject;
  note?: string | null;
}

function build(parts: DialogParts): BlockedDialog {
  return {
    kind: parts.kind,
    program: 'grok',
    title: parts.title,
    sourceSuffix: null,
    positionLabel: null,
    body: parts.body,
    progress: null,
    options: parts.options,
    rows: parts.card.rows,
    fingerprint: dialogFingerprint({
      program: 'grok',
      kind: parts.kind,
      title: parts.title,
      sourceSuffix: null,
      body: parts.body,
      progress: null,
      options: parts.options,
    }),
    focus: parts.card.focus(parts.options),
    subject: parts.subject,
    note: parts.note ?? null,
  };
}

export function parseGrokDialog(screen: AnsiScreen): DialogParseResult {
  const grok = readGrokScreen(screen);
  if (grok.card === null) return NO_DIALOG;
  const card = new GrokCard(grok.card, screen, grok.footer);
  // The card of an agent the dashboard shows, which may not be this conversation's.
  if (grok.isDashboardOverlay)
    return { kind: 'unrecognized', excerpt: card.excerpt(OVERLAY_REASON) };
  const dialog = cancelPanel(card) ?? permission(card) ?? question(card, screen) ?? fork(card);
  if (dialog) return { kind: 'dialog', dialog };
  return { kind: 'unrecognized', excerpt: card.excerpt(genericReason(card)) };
}

/** Why a card stays generic: `/fork`'s worktree question that `fork` can't read, a question Agentico doesn't answer, or a card it doesn't know. */
function genericReason(card: GrokCard): string {
  if (answerSheet(card)?.question === FORK_QUESTION) {
    const lasting = FORK_ROWS.filter((row) => !row.offered).map((row) => row.label);
    const shown = lasting.every((label) =>
      card.lines.some((line) => line.option !== null && optionNames(line.option, label)),
    );
    return shown ? FORK_REASON : FORK_HIDDEN_ROWS_REASON;
  }
  const asks = card.lines.some((line) => line.option?.key === FREE_TEXT_KEY);
  return asks ? QUESTION_REASON : UNKNOWN_REASON;
}

// MARK: Permission

type PermissionRow =
  | { kind: 'offered'; label: string; role: DialogOptionRole }
  | { kind: 'withheld'; label: string }
  /** A lasting rule cut to fit with `…`. */
  | { kind: 'cutRule'; label: string };

/** A permission's row by its label, whole or as far as the card's edge let it show. A known label reads in full even where it was cut. */
function permissionRow(option: GrokOption): PermissionRow | null {
  const offered: [string, DialogOptionRole][] = [
    ['Yes, proceed', 'approve'],
    ['Yes', 'approve'],
    [SEND_ONCE, 'approve'],
    [SESSION_EDITS, 'approvePersistent'],
    [REJECT, 'decline'],
  ];
  const known = offered.find(([label]) => optionNames(option, label));
  if (known) return { kind: 'offered', label: known[0], role: known[1] };
  if (optionNames(option, ALWAYS_APPROVE)) return { kind: 'withheld', label: ALWAYS_APPROVE };
  // The rule's scope follows the colon, cut to fit with `…`, and a cut scope hides how far the rule reaches.
  if (optionBegins(option, 'Always allow:')) {
    return option.label.endsWith('…')
      ? { kind: 'cutRule', label: option.label }
      : { kind: 'offered', label: option.label, role: 'approvePersistent' };
  }
  if (optionShortens(option, SESSION_EDITS)) return { kind: 'cutRule', label: option.label };
  if (optionBegins(option, 'Never allow:')) return { kind: 'withheld', label: option.label };
  return null;
}

/**
 * `›  <description>`, the command on `│` rows, the scope hint, then the options, recognised by the
 * reject row. A digit selects its row and submits it. Always-approve mode and `Never allow:` stay on
 * screen and in the body, never among the options, as does a lasting rule Grok cut to fit with `…`,
 * whose reach the card then hides; the note says how to see it. Before a subagent starts, Grok asks
 * `Allow <description>?` alone, and `Yes, send once` approves that subagent.
 */
function permission(card: GrokCard): BlockedDialog | null {
  const first = card.lines.findIndex((line) => line.option !== null);
  if (first < 0) return null;
  const options: DialogOption[] = [];
  const withheld: string[] = [];
  let hidesRule = false;
  for (let index = first; index < card.lines.length; index += 1) {
    const line = card.lines[index] as GrokLine;
    const option = line.option;
    if (option === null) {
      // Only blank rows follow the options. Anything else, such as feedback typed on the reject
      // row, leaves the card to the terminal.
      if (line.text !== '') return null;
      continue;
    }
    const number = /^[+-]?\d+$/.test(option.key) ? Number(option.key) : null;
    const row = number !== null && number >= 1 && number <= 9 ? permissionRow(option) : null;
    if (number === null || row === null) return null;
    if (row.kind === 'withheld') withheld.push(row.label);
    else if (row.kind === 'cutRule') {
      withheld.push(row.label);
      hidesRule = true;
    } else {
      options.push(
        makeOption({
          ordinal: options.length + 1,
          number,
          label: row.label,
          detail: row.role === 'decline' ? 'Ends the turn' : null,
          shortcut: option.key,
          role: row.role,
          isFocused: index === card.cursor,
        }),
      );
    }
  }
  const roles = new Set(options.map((option) => option.role));
  if (!roles.has('decline') || !roles.has('approve')) return null;

  const head = card.lines.slice(0, first);
  const descriptionRow = head.find((line) => line.text.startsWith('›'));
  const descriptionText = descriptionRow ? trimmed(dropFirst(descriptionRow.text)) : null;
  const description = descriptionText === '' ? null : descriptionText;
  let command = head
    .filter((line) => line.text.startsWith('│'))
    .map((line) => trimmed(dropFirst(line.text)))
    .join(' ');
  // A command too long for its rows ends in ` …`.
  if (command.endsWith('…')) command = trimmed([...command].slice(0, -1).join(''));

  const subject = makeSubject();
  let title: string;
  const target = description === null ? null : /^Allow (\S+) to (.+)$/u.exec(description);
  if (command !== '') {
    title = 'Allow Command';
    subject.command = command;
    // Cut to fit, the description gives way to the command.
    subject.commandDescription = description?.endsWith('…') ? null : description;
  } else if (description !== null && options.some((option) => option.label === SEND_ONCE)) {
    // The subagent's own words, which may read like an edit's.
    title = description.endsWith('?') ? [...description].slice(0, -1).join('') : description;
  } else if (target) {
    // `Allow Edit to <path>?`. The card's edge can cut the path, and then its `?` is gone.
    title = `Allow ${target[1]}`;
    const path = target[2] as string;
    if (path.endsWith('?')) subject.filePath = [...path].slice(0, -1).join('');
  } else if (description?.startsWith('Allow ') && description.endsWith('?')) {
    title = [...description].slice(0, -1).join('');
  } else {
    title = 'Allow Tool';
  }
  const body = [
    ...[description, subject.command].filter((part): part is string => part !== null),
    ...withheld,
  ];
  return build({
    kind: 'grokPermission',
    title,
    body,
    options,
    card,
    subject,
    note: hidesRule ? CUT_RULE_NOTE : null,
  });
}

// MARK: Question

/**
 * One question with single-select answers keyed `1` to `9`, then `a` on, and the typed answer's `z`
 * row last, under the turn's `◆ Waiting on answers for <question>` row. Several questions add a
 * counter to the card's hint row and stay generic, as does a question with no turn waiting on it
 * other than the fork question. A key selects its answer and submits the question.
 */
function question(card: GrokCard, screen: AnsiScreen): BlockedDialog | null {
  const sheet = answerSheet(card);
  if (!waitsOnAnswers(screen.rows, card.rows.lowerBound) || sheet === null) return null;
  const options = sheet.answers.map((answer, offset) =>
    answerOption(answer, offset + 1, answer.line === card.cursor),
  );
  options.push(freeTextOption(options.length + 1, sheet.field === card.cursor));
  const subject = makeSubject();
  subject.question = sheet.question;
  return build({
    kind: 'grokQuestion',
    title: sheet.question,
    body: [sheet.question, ...sheet.description],
    options,
    card,
    subject,
  });
}

// MARK: Fork question

/**
 * `/fork`'s `Run this fork in an isolated git worktree?`, a question card with no turn waiting on
 * it. `1 Yes` and `2 No` each fork, into a new worktree or the current directory. `3 Always
 * worktree` and `4 Never worktree` also save the choice in Grok's config, so they stay on screen and
 * in the body, never among the options, as a typed answer stays in the terminal. A narrow card
 * scrolls its later rows out of view, and one without both Yes and No stays generic. A key selects
 * its row wherever the cursor is, except on the answer field, where it is typed, so with the
 * keyboard on the card the cursor must show.
 */
function fork(card: GrokCard): BlockedDialog | null {
  const sheet = answerSheet(card);
  if (
    sheet === null ||
    sheet.question !== FORK_QUESTION ||
    sheet.description.length > 0 ||
    !(card.cursor !== null || !card.hasKeyboard) ||
    sheet.answers.length < 2 ||
    sheet.answers.length > FORK_ROWS.length
  ) {
    return null;
  }
  const options: DialogOption[] = [];
  const withheld: string[] = [];
  for (const [index, answer] of sheet.answers.entries()) {
    const row = FORK_ROWS[index] as (typeof FORK_ROWS)[number];
    if (answer.key !== row.key || answer.label.length !== 1 || answer.label[0] !== row.label) {
      return null;
    }
    if (row.offered)
      options.push(answerOption(answer, options.length + 1, answer.line === card.cursor));
    else withheld.push(row.label);
  }
  options.push(freeTextOption(options.length + 1, sheet.field === card.cursor));
  return build({
    kind: 'grokFork',
    title: sheet.question,
    body: [sheet.question, ...withheld],
    options,
    card,
    subject: makeSubject(),
  });
}

// MARK: Subagent panel

/**
 * `Subagents are still running. Stop them?`, the count, then `1 Stop running`, `2 Continue to run`,
 * and two `Always` rows, which write config and stay in the terminal. Continuing still ends the
 * turn; only the subagents go on.
 */
function cancelPanel(card: GrokCard): BlockedDialog | null {
  const top = card.lines.findIndex((line) => line.text !== '');
  const first = card.lines.findIndex((line) => line.option !== null);
  const topLine = card.lines[top];
  if (
    !topLine ||
    topLine.option !== null ||
    !topLine.text.startsWith('Subagents are still running') ||
    first < 0
  ) {
    return null;
  }
  // The card's edge can cut the title at a phone's width.
  const title = CANCEL_TITLE.startsWith(topLine.text) ? CANCEL_TITLE : topLine.text;
  const body = card.lines
    .slice(top + 1, first)
    .map((line) => line.text)
    .filter((text) => text !== '');
  const options: DialogOption[] = [];
  for (let index = first; index < card.lines.length; index += 1) {
    const line = card.lines[index] as GrokLine;
    const option = line.option;
    if (option === null) {
      if (line.text !== '') return null;
      continue;
    }
    if (!/^[+-]?\d+$/.test(option.key)) return null;
    let choice: { label: string; detail: string; role: DialogOptionRole };
    if (optionNames(option, 'Stop running')) {
      choice = {
        label: 'Stop running',
        detail: 'Stops the turn and its subagents',
        role: 'cancel',
      };
    } else if (optionNames(option, 'Continue to run')) {
      choice = {
        label: 'Continue to run',
        detail: 'Ends the turn; subagents keep running',
        role: 'answer',
      };
    } else if (optionNames(option, 'Always stop') || optionNames(option, 'Always continue')) {
      continue;
    } else {
      return null;
    }
    options.push(
      makeOption({
        ordinal: options.length + 1,
        number: Number(option.key),
        label: choice.label,
        detail: choice.detail,
        shortcut: option.key,
        role: choice.role,
        isFocused: index === card.cursor,
      }),
    );
  }
  const roles = options.map((option) => option.role);
  if (roles.length !== 2 || roles[0] !== 'cancel' || roles[1] !== 'answer') return null;
  return build({ kind: 'grokCancelTurn', title, body, options, card, subject: makeSubject() });
}
