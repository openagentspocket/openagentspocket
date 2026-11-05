// Reads OpenCode's permission and question prompts from a visible-screen read (Swift
// OpenCodeDialogParser).
//
// OpenCode 2.0.32 draws a prompt in place of its input box, at the bottom of the session: a block of
// rows behind a left bar `┃` on a raised background, with a blank bar row above and below its text.
// Messages and tool output in the history use the same bar, but the input box ends the screen with
// its status row, so a bar block is a prompt only when it ends the screen. Its first row names it:
// `△ Permission required`, `△ Reject permission` (the note a subagent's rejection asks for) or the
// muted `Questions` of a question form. Any other block, such as the subagent panel, is no prompt.

import { message, type Text } from '../errors/text';
import { textWidth } from './cell-width';
import { comparable } from './comparable';
import { dialogFingerprint, excerptFingerprint } from './fingerprint';
import {
  OpenCodeBlock,
  type OpenCodeBlockLine,
  sectionsOf,
  textFromColumn,
} from './opencode-block';
import { type AnsiScreen, runAt, type ScreenColor, sameColor, trimBlanks } from './screen';
import {
  type BlockedDialog,
  type DialogOption,
  type DialogOptionRole,
  type DialogParseResult,
  makeFocus,
  makeOption,
  makeSubject,
  NO_DIALOG,
} from './types';

const PERMISSION_HEADING = '△ Permission required';
const PERMISSION_TITLE = 'Permission required';
const ALLOW_ONCE = 'Allow once';
const ALWAYS_ALLOW = 'Always allow';
const REJECT = 'Reject';
const PERMISSION_ROLES: Readonly<Record<string, DialogOptionRole>> = {
  [ALLOW_ONCE]: 'approve',
  [ALWAYS_ALLOW]: 'approvePersistent',
  [REJECT]: 'decline',
};
const SINGLE_QUESTION_FOOTER = '↑↓ select  enter submit  esc dismiss';
const OWN_ANSWER = 'Type your own answer';

export function parseOpenCodeDialog(screen: AnsiScreen): DialogParseResult {
  const block = OpenCodeBlock.bottom(screen);
  const heading = block?.sections[0]?.[0]?.text;
  if (!block || heading === undefined) return NO_DIALOG;
  switch (heading) {
    case PERMISSION_HEADING:
      return permission(block, screen);
    case '△ Reject permission':
      return unrecognized(
        block,
        screen,
        message(
          'OpenCode asks what to do differently before it rejects. Answer it in the terminal.',
        ),
      );
    case 'Questions':
      return question(block, screen);
    default:
      return NO_DIALOG;
  }
}

// MARK: Permissions

interface PermissionLabel {
  label: string;
  background: ScreenColor | null;
}

/**
 * The labels at the start of the options row, each with the fill it is drawn on. Two or more blanks
 * part the options from each other and from the key hints.
 */
function permissionOptions(line: OpenCodeBlockLine): PermissionLabel[] | null {
  const items = line.text
    .split('  ')
    .map(trimBlanks)
    .filter((item) => item !== '');
  const labels: string[] = [];
  for (const item of items) {
    if (PERMISSION_ROLES[item] === undefined) break;
    labels.push(item);
  }
  const joined = labels.join('|');
  if (
    joined !== [ALLOW_ONCE, ALWAYS_ALLOW, REJECT].join('|') &&
    joined !== [ALLOW_ONCE, REJECT].join('|')
  ) {
    return null;
  }
  const result: PermissionLabel[] = [];
  let searchFrom = 0;
  const text = line.row.text;
  for (const label of labels) {
    const at = text.indexOf(label, searchFrom);
    if (at < 0) return null;
    const column = textWidth(text.slice(0, at));
    result.push({ label, background: runAt(line.row, column)?.style.background ?? null });
    searchFrom = at + label.length;
  }
  return result;
}

/**
 * The option drawn on a fill unlike the band's. A theme that fills every option leaves the focused
 * one as the only fill of its kind.
 */
function focusedOption(backgrounds: readonly (ScreenColor | null)[], panel: ScreenColor | null) {
  const filled = backgrounds.flatMap((background, index) =>
    sameColor(background, panel) ? [] : [index],
  );
  if (filled.length === 1) return filled[0] ?? null;
  const lone = backgrounds.flatMap((background, index) =>
    backgrounds.filter((other) => sameColor(other, background)).length === 1 ? [index] : [],
  );
  return backgrounds.length > 2 && lone.length === 1 ? (lone[0] ?? null) : null;
}

/**
 * `△ Permission required`, then `<icon> <action> <target>` (`→ Read .env`; a shell command has no
 * such row), OpenCode's lines about the request (`Path: .env`, `$ ls -la`), and the options in a row
 * on a darker band: `Allow once`, `Always allow` when OpenCode can keep a rule, and `Reject`, the
 * focused one on a fill of its own. The key hints share the options' row on a wide screen and take a
 * row below them under 80 columns.
 *
 * While `Always allow` has focus, OpenCode swaps the lines about the request for what the rule would
 * allow, so those lines are notes and only the action row is the body. The fingerprint still carries
 * the lines, apart from the body: a shell command's permission has no action row, and a subagent's
 * names only the agent, so only their `$ git status` or `◉ <description>` line tells one request
 * from the next.
 */
function permission(block: OpenCodeBlock, screen: AnsiScreen): DialogParseResult {
  const layout = message(
    "Agentico doesn't know this permission's layout. Answer it with these keys or in the terminal.",
  );
  const sections = block.sections;
  const optionsIndex = sections.findIndex((section) => section[0]?.text.startsWith(ALLOW_ONCE));
  const optionsLine = sections[optionsIndex]?.[0];
  const labels = optionsLine ? permissionOptions(optionsLine) : null;
  if (optionsIndex <= 0 || !optionsLine || !labels) return unrecognized(block, screen, layout);

  const header = (sections[0] ?? []).slice(1);
  const action = header.length === 0 ? null : block.joined(header);
  let target: string | null = null;
  if (action !== null) {
    // The icon, then the action and its target.
    const characters = [...action];
    if (characters.indexOf(' ') !== 1) return unrecognized(block, screen, layout);
    target = trimBlanks(characters.slice(2).join(''));
  }
  let notes = sections.slice(1, optionsIndex).flatMap((section) => block.paragraphs(section));
  const showsRule = notes[0]?.startsWith('This will always allow') === true;
  const body = target === null ? [] : [target];

  const subject = makeSubject();
  if (target !== null) {
    const space = target.indexOf(' ');
    subject.toolName = space < 0 ? target : target.slice(0, space);
    const operand = space < 0 ? null : target.slice(space + 1);
    switch (subject.toolName) {
      case 'Read':
      case 'List':
      case 'Edit':
      case 'Write':
      case 'Patch':
        subject.filePath = operand;
        break;
      case 'WebFetch':
        subject.url = operand;
        break;
      default:
        break;
    }
    // An edit's lines are its diff, which stays in the terminal.
    if (subject.toolName === 'Edit' && !showsRule) notes = [];
  } else {
    subject.toolName = 'Shell';
    const command = notes.find((note) => note.startsWith('$ '));
    subject.command = command === undefined ? null : command.slice(2);
  }
  subject.notes = notes;

  const focused = focusedOption(
    labels.map((item) => item.background),
    optionsLine.background,
  );
  const options = labels.map(
    (item, index): DialogOption =>
      makeOption({
        ordinal: index + 1,
        number: null,
        label: item.label,
        role: PERMISSION_ROLES[item.label] ?? 'decline',
        isFocused: focused === index,
      }),
  );
  const dialog: BlockedDialog = {
    kind: 'openCodePermission',
    program: 'opencode',
    title: PERMISSION_TITLE,
    sourceSuffix: null,
    positionLabel: null,
    body,
    progress: null,
    options,
    rows: block.rows,
    fingerprint: dialogFingerprint({
      program: 'opencode',
      kind: 'openCodePermission',
      title: PERMISSION_TITLE,
      sourceSuffix: null,
      body,
      progress: null,
      options,
      requestLines: showsRule ? null : notes,
      ruleLines: showsRule ? notes : null,
    }),
    focus: makeFocus({ focusedOrdinal: focused === null ? null : focused + 1 }),
    subject,
    note: null,
  };
  return { kind: 'dialog', dialog };
}

// MARK: Questions

interface Answer {
  number: number;
  labelLines: OpenCodeBlockLine[];
  labelColor: ScreenColor | null;
  detailLines: OpenCodeBlockLine[];
  isFocused: boolean;
}

/**
 * The numbered answers, 1 up, the last one OpenCode's own answer row. A deeper row continues the
 * answer above: its label when drawn in the label's color, its description otherwise.
 */
function answers(lines: readonly OpenCodeBlockLine[], block: OpenCodeBlock): DialogOption[] | null {
  const indent = lines[0]?.indent;
  if (indent === undefined) return null;
  const found: Answer[] = [];
  for (const line of lines) {
    if (line.indent === indent) {
      const digits = /^[0-9]+/.exec(line.text)?.[0] ?? '';
      const number = digits === '' ? Number.NaN : Number.parseInt(digits, 10);
      if (number !== found.length + 1 || !line.text.slice(digits.length).startsWith('. '))
        return null;
      const labelColumn = line.column + digits.length + 2;
      const labelColor = runAt(line.row, labelColumn)?.style.foreground ?? null;
      const label: OpenCodeBlockLine = {
        text: trimBlanks(textFromColumn(line.row, labelColumn)),
        indent: line.indent + digits.length + 2,
        column: labelColumn,
        background: line.background,
        row: line.row,
      };
      found.push({
        number,
        labelLines: [label],
        labelColor,
        detailLines: [],
        isFocused: sameColor(runAt(line.row, line.column)?.style.foreground ?? null, labelColor),
      });
    } else if (line.indent > indent && found.length > 0) {
      const answer = found[found.length - 1] as Answer;
      const color = runAt(line.row, line.column)?.style.foreground ?? null;
      if (answer.detailLines.length === 0 && sameColor(color, answer.labelColor)) {
        answer.labelLines.push(line);
      } else {
        answer.detailLines.push(line);
      }
    } else {
      return null;
    }
  }
  const last = found[found.length - 1];
  if (found.length < 2 || !last || block.joined(last.labelLines) !== OWN_ANSWER) return null;
  // Without any focus shown, every row would read as focused.
  const showsFocus = found.filter((answer) => answer.isFocused).length === 1;
  return found.map((answer, index) => {
    let label = block.joined(answer.labelLines);
    // A picked answer ends in a check.
    if (label.endsWith('✓')) label = trimBlanks(label.slice(0, -1));
    return makeOption({
      ordinal: index + 1,
      number: answer.number,
      label,
      detail: answer.detailLines.length === 0 ? null : block.joined(answer.detailLines),
      role: index === found.length - 1 ? 'otherText' : 'answer',
      isFocused: showsFocus && answer.isFocused,
    });
  });
}

/**
 * `Questions`, the question, then `N. label` per answer, each answer's description indented under
 * its label, and `N. Type your own answer` last; the focused answer's number and label share their
 * color. Below, `↑↓ select  enter submit  esc dismiss`. A digit picks its answer and submits.
 * Several questions add a tab row and `⇆ tab`, a multi-select question `enter toggle`, and typing an
 * answer `esc close`; those stay in the terminal.
 */
function question(block: OpenCodeBlock, screen: AnsiScreen): DialogParseResult {
  const layout = message(
    "Agentico answers only OpenCode's single questions. Answer this one in the terminal.",
  );
  const sections = block.sections;
  const footer = sections.at(-1);
  const options = sections.length >= 4 ? answers(sections[sections.length - 2] ?? [], block) : null;
  if (
    footer?.length !== 1 ||
    comparable(footer[0]?.text ?? '') !== comparable(SINGLE_QUESTION_FOOTER) ||
    !options
  ) {
    return unrecognized(block, screen, layout);
  }
  const texts = sections.slice(1, sections.length - 2).map((section) => block.joined(section));
  const asked = texts.at(-1);
  if (asked === undefined) return unrecognized(block, screen, layout);
  const subject = makeSubject();
  subject.question = asked;
  const focused = options.filter((option) => option.isFocused);
  const dialog: BlockedDialog = {
    kind: 'openCodeQuestion',
    program: 'opencode',
    title: asked,
    sourceSuffix: null,
    positionLabel: null,
    body: texts,
    progress: null,
    options,
    rows: block.rows,
    fingerprint: dialogFingerprint({
      program: 'opencode',
      kind: 'openCodeQuestion',
      title: asked,
      sourceSuffix: null,
      body: texts,
      progress: null,
      options,
    }),
    focus: makeFocus({
      focusedOrdinal: focused.length === 1 ? (focused[0]?.ordinal ?? null) : null,
    }),
    subject,
    note: null,
  };
  return { kind: 'dialog', dialog };
}

// MARK: Anything else

/**
 * The block's rows verbatim, shown without the bar. The fingerprint covers the text on the block's
 * own background, without what changes as the user acts: the band below it (options, or a reply
 * field and its hints), or a form's key hints, its last row.
 */
function unrecognized(block: OpenCodeBlock, screen: AnsiScreen, reason: Text): DialogParseResult {
  const panel = block.lines[0]?.background ?? null;
  const content: OpenCodeBlockLine[] = [];
  for (const line of block.lines) {
    if (!sameColor(line.background, panel)) break;
    content.push(line);
  }
  const sections = sectionsOf(content);
  if (content.length === block.lines.length && sections.length > 1) sections.pop();
  return {
    kind: 'unrecognized',
    excerpt: {
      rows: screen.rows.slice(block.rows.lowerBound, block.rows.upperBound),
      numbered: new Map(),
      reason,
      fingerprint: excerptFingerprint(
        'opencode',
        sections.flat().map((line) => line.text),
      ),
      displayLines: block.lines.map((line) => {
        // The band's hints sit at its right edge on a wide screen.
        const indent = sameColor(line.background, panel) ? Math.max(0, line.indent - 2) : 0;
        return line.text === '' ? '' : ' '.repeat(indent) + line.text;
      }),
    },
  };
}
