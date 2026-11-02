import { message, type Text } from '../errors/text';
import { claudeExcerpt, footerRebinding, readFooter } from './claude-models';
import { dialogFingerprint } from './fingerprint';
import { isRule, joinWrapped } from './row-scanner';
import {
  type AnsiScreen,
  rowIndent,
  rowIsBlank,
  runAt,
  type ScreenRow,
  sameColor,
  trimBlanks,
  trimmedText,
  visibleRuns,
} from './screen';
import {
  type DialogOption,
  type DialogParseResult,
  makeFocus,
  makeOption,
  makeSubject,
  NO_DIALOG,
} from './types';

const TRUST_TITLE = 'Accessing workspace:';

const lastIndexWhere = (rows: readonly ScreenRow[], test: (row: ScreenRow) => boolean): number => {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row && test(row)) return index;
  }
  return -1;
};

/**
 * Claude's folder-trust dialog at startup: a warning-colored rule, the bold `Accessing
 * workspace:` title and two unnumbered options. Esc and `No, exit` quit Claude Code.
 */
export function readClaudeTrustDialog(screen: AnsiScreen): DialogParseResult | null {
  const rows = screen.rows;
  const at = (index: number): ScreenRow => rows[index] ?? { index, runs: [], text: '', width: 0 };
  const fullWidth = Math.max(8, screen.columns - 4);
  const titleIndex = lastIndexWhere(
    rows,
    (row) => trimmedText(row) === TRUST_TITLE && visibleRuns(row).every((run) => run.style.isBold),
  );
  const last = lastIndexWhere(rows, (row) => !rowIsBlank(row));
  if (titleIndex <= 0 || !isRule(at(titleIndex - 1), '─', fullWidth) || last <= titleIndex) {
    return null;
  }
  const top = titleIndex - 1;

  // The footer, then a blank row, then the options above it.
  let footerStart = last;
  while (footerStart > titleIndex && !rowIsBlank(at(footerStart - 1))) footerStart -= 1;
  let optionsEnd = footerStart - 1;
  while (optionsEnd > titleIndex && rowIsBlank(at(optionsEnd))) optionsEnd -= 1;
  let optionsStart = optionsEnd;
  while (optionsStart > titleIndex + 1 && !rowIsBlank(at(optionsStart - 1))) optionsStart -= 1;
  const footer = readFooter(rows.slice(footerStart, last + 1));
  const optionRows = optionsStart <= optionsEnd ? rows.slice(optionsStart, optionsEnd + 1) : [];

  // The options carry no numbers, so the generic card offers no option buttons.
  const unrecognized = (reason: Text): DialogParseResult => ({
    kind: 'unrecognized',
    excerpt: claudeExcerpt(
      rows.slice(top, last + 1),
      new Set(rows.slice(footerStart, last + 1).map((row) => row.index)),
      new Map(),
      reason,
    ),
  });

  if (!(footerStart > optionsEnd + 1) || optionRows.length !== 2) {
    return unrecognized(message("The trust dialog's options are not where Agentico expects them."));
  }
  const rebinding = footerRebinding(footer);
  if (rebinding !== null) {
    return unrecognized(
      message("The footer shows “%@”; Agentico only sends Claude's default keys.", rebinding),
    );
  }
  const options: DialogOption[] = [];
  for (const [index, row] of optionRows.entries()) {
    const text = trimmedText(row);
    const isFocused = text.startsWith('❯');
    const label = isFocused ? trimBlanks([...text].slice(1).join('')) : text;
    const role = label.startsWith('No') ? 'exitProgram' : label.startsWith('Yes') ? 'trust' : null;
    if (role === null) {
      return unrecognized(
        message('The trust dialog offers “%@”, which Agentico does not know.', label),
      );
    }
    options.push(makeOption({ ordinal: index + 1, number: null, label, role, isFocused }));
  }
  const roles = new Set(options.map((option) => option.role));
  if (!(roles.size === 2 && roles.has('exitProgram') && roles.has('trust'))) {
    return unrecognized(message("The trust dialog's options are not a Yes and a No."));
  }

  const body: string[] = [];
  const subject = makeSubject();
  let paragraph: ScreenRow[] = [];
  const flush = () => {
    if (paragraph.length === 0) return;
    let text = '';
    let previous: ScreenRow | undefined;
    for (const row of paragraph) {
      text = previous
        ? joinWrapped(
            text,
            trimmedText(row),
            'claude',
            previous,
            screen.columns,
            rowIndent(row) ?? 0,
          )
        : trimmedText(row);
      previous = row;
    }
    body.push(text);
    paragraph = [];
  };
  for (let index = titleIndex + 1; index < optionsStart; index += 1) {
    const row = at(index);
    if (rowIsBlank(row)) {
      flush();
      continue;
    }
    // Leave out the inactive `Security guide` link.
    const visible = visibleRuns(row);
    if (!visible.some((run) => run.style.foreground === null)) continue;
    if (subject.workspacePath === null && visible.every((run) => run.style.isBold)) {
      subject.workspacePath = trimmedText(row);
    }
    paragraph.push(row);
  }
  flush();

  const focused = options.find((option) => option.isFocused);
  return {
    kind: 'dialog',
    dialog: {
      kind: 'claudeWorkspaceTrust',
      program: 'claude',
      title: TRUST_TITLE,
      sourceSuffix: null,
      positionLabel: null,
      body,
      progress: null,
      options,
      rows: { lowerBound: top, upperBound: last + 1 },
      fingerprint: dialogFingerprint({
        program: 'claude',
        kind: 'claudeWorkspaceTrust',
        title: TRUST_TITLE,
        sourceSuffix: null,
        body,
        progress: null,
        options,
      }),
      focus: makeFocus({ focusedOrdinal: focused?.ordinal ?? null }),
      subject,
      note: null,
    },
  };
}

/**
 * A Claude dialog without numbered options that is not the trust dialog, such as a tool prompt
 * that defaults to No. It goes to the generic card when its footer and a pointer row show it is a
 * live dialog.
 */
export function readClaudeLooseDialog(screen: AnsiScreen): DialogParseResult {
  const rows = screen.rows;
  const last = lastIndexWhere(rows, (row) => !rowIsBlank(row));
  if (last < 0) return NO_DIALOG;
  const footer = rows[last];
  if (!footer) return NO_DIALOG;
  const text = trimmedText(footer);
  // Footers are drawn in one color, never the default.
  const colors = visibleRuns(footer).map((run) => run.style.foreground);
  const first = colors[0] ?? null;
  const oneColor = first !== null && colors.every((color) => sameColor(color, first));
  if (!oneColor || !['to cancel', 'to confirm', 'to select'].some((hint) => text.includes(hint))) {
    return NO_DIALOG;
  }
  let pointerRow = -1;
  for (let index = last - 1; index >= Math.max(0, last - 12); index -= 1) {
    const row = rows[index];
    if (!row) continue;
    const indent = rowIndent(row);
    if (indent === null || indent > 4) continue;
    if (
      trimmedText(row).startsWith('❯ ') &&
      (runAt(row, indent)?.style.background ?? null) === null
    ) {
      pointerRow = index;
      break;
    }
  }
  if (pointerRow < 0) return NO_DIALOG;
  const fullWidth = Math.max(8, screen.columns - 4);
  let top = Math.max(0, pointerRow - 12);
  for (let index = pointerRow - 1; index >= Math.max(0, pointerRow - 25); index -= 1) {
    const row = rows[index];
    if (row && isRule(row, '─', fullWidth)) {
      top = index;
      break;
    }
  }
  return {
    kind: 'unrecognized',
    excerpt: claudeExcerpt(
      rows.slice(top, last + 1),
      new Set([last]),
      new Map(),
      message("The dialog's options are not numbered."),
    ),
  };
}
