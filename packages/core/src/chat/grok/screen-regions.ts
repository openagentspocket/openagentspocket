// The regions around Grok Build's composer (Swift GrokScreen): the box, the status row and dock, overlays, the card, focus, welcome.

import { textWidth } from '../../blocked/cell-width';
import { withoutScrollbar } from '../../blocked/grok-screen';
import {
  normalizedSpaces,
  rowIndent,
  type ScreenRow,
  trimBlanks,
  trimmedText,
} from '../../blocked/screen';
import type { GrokComposer, GrokComposerMode, GrokStatusRow } from './screen';

export const INTERRUPT_HINT = 'send a message to interrupt';

const BORDER_CHARACTERS = new Set([...'╭╮╰╯─ ']);
const trimSet = (text: string, set: ReadonlySet<string>): string => {
  const chars = [...text];
  let start = 0;
  let end = chars.length;
  while (start < end && set.has(chars[start] as string)) start += 1;
  while (end > start && set.has(chars[end - 1] as string)) end -= 1;
  return chars.slice(start, end).join('');
};

const EDITING_QUEUED = 'editing queued #';

function promptMode(row: ScreenRow): GrokComposerMode | null {
  const text = trimmedText(row);
  if (text.startsWith('│ ❯ ')) return 'prompt';
  if (text.startsWith('│ ! ')) return 'bash';
  if (text.startsWith('│ # ')) return 'remember';
  return null;
}

/** The display column of the last `character` on the row. */
function lastColumn(character: string, row: ScreenRow): number | null {
  let column = 0;
  let last: number | null = null;
  for (const cell of row.text) {
    if (cell === character) last = column;
    column += textWidth(cell);
  }
  return last;
}

/** The text from `start` up to `end`, split into the typed cells and the italic ones. */
function splitTyped(row: ScreenRow, start: number, end: number): { typed: string; ghost: string } {
  let typed = '';
  let ghost = '';
  for (const run of row.runs) {
    if (!(run.column + run.width > start && run.column < end)) continue;
    let column = run.column;
    for (const character of run.text) {
      const width = textWidth(character);
      const inside = column >= start && column + width <= end;
      column += width;
      if (!inside) continue;
      if (run.style.isItalic) ghost += character;
      else typed += character;
    }
  }
  return { typed, ghost };
}

export function readComposer(rows: readonly ScreenRow[]): GrokComposer | null {
  // The bottom-most box: popups and panels above it draw boxes too.
  for (let top = rows.length - 3; top >= 0; top -= 1) {
    const topRow = rows[top] as ScreenRow;
    const first = rows[top + 1] as ScreenRow;
    const mode = promptMode(first);
    if (!trimmedText(topRow).startsWith('╭─') || mode === null) continue;
    let bottom: number | null = null;
    for (let index = top + 2; index < Math.min(rows.length, top + 2 + 40); index += 1) {
      if (trimmedText(rows[index] as ScreenRow).startsWith('╰─')) {
        bottom = index;
        break;
      }
    }
    if (bottom === null) continue;
    let boxed = true;
    for (let index = top + 1; index < bottom; index += 1) {
      if (!trimmedText(rows[index] as ScreenRow).startsWith('│')) boxed = false;
    }
    if (!boxed) continue;
    const typed: string[] = [];
    const ghost: string[] = [];
    for (let index = top + 1; index < bottom; index += 1) {
      const row = rows[index] as ScreenRow;
      const left = rowIndent(row);
      const right = lastColumn('│', row);
      if (left === null || right === null || right <= left) continue;
      // `│ ❯ ` before the first row's text.
      const text = splitTyped(row, left + (index === top + 1 ? 4 : 1), right);
      typed.push(trimBlanks(text.typed));
      ghost.push(trimBlanks(text.ghost));
    }
    let draft = typed.filter((line) => line !== '').join('\n');
    // Bash mode names its empty box "Run shell command".
    if (mode === 'bash' && draft === 'Run shell command') draft = '';
    const topLabel = trimSet(trimmedText(topRow), BORDER_CHARACTERS);
    return {
      mode,
      draft,
      ghost: ghost.filter((line) => line !== '').join('\n'),
      topBorderLabel: topLabel === '' ? null : topLabel,
      bottomBorder: trimSet(trimmedText(rows[bottom] as ScreenRow), BORDER_CHARACTERS),
      topRow: top,
      bottomRow: bottom,
    };
  }
  return null;
}

/** Enter adds a line instead of sending. */
export const composerIsMultiline = (composer: GrokComposer): boolean =>
  composer.bottomBorder.endsWith('multiline');

/** Enter saves the edit to a queued message. */
export const composerIsEditingQueued = (composer: GrokComposer): boolean =>
  composer.bottomBorder.includes(EDITING_QUEUED) ||
  composer.topBorderLabel?.includes(EDITING_QUEUED) === true;

const TOASTS = ['Press Ctrl+c to cancel the turn', 'Input cleared · ctrl+z to undo'];
const CUE_ICONS = new Set(['○', '◎', '◉']);
const DOCK_MARKERS = new Set(['⋅', ':', '⸬', '⁙', '◆']);

/** A queued message (`#1 …`) or a dock item (`⋅ Subagent …`). */
function isDockItem(text: string): boolean {
  const scalars = [...text].slice(0, 2);
  if (scalars.length < 2) return false;
  const [lead, next] = scalars as [string, string];
  if (lead === '#') return next >= '0' && next <= '9';
  return DOCK_MARKERS.has(lead) && next === ' ';
}

/** The spinner, then the label up to its `…` or the phase timer, then the rest. */
function statusRowOf(index: number, text: string): GrokStatusRow {
  const rest = trimBlanks([...text].slice(1).join(''));
  const ellipsis = rest.indexOf('…');
  const afterEllipsis = ellipsis < 0 ? Number.POSITIVE_INFINITY : ellipsis + 1;
  const timer = / (?:\d+\.\ds|\d+s|\d+m\d+s|\d+h\d+m)(?= |$)| {2}/u.exec(rest);
  const timerAt = timer === null ? Number.POSITIVE_INFINITY : timer.index;
  const end = Math.min(afterEllipsis, timerAt, rest.length);
  return {
    row: index,
    label: trimBlanks(rest.slice(0, end)),
    trailer: trimBlanks(rest.slice(end)),
  };
}

/** Scans up from the composer: blank rows, toasts and dock rows lie between it and the status row. */
export function statusArea(
  rows: readonly ScreenRow[],
  top: number,
): { status: GrokStatusRow | null; cue: string | null; dock: string[] } {
  const dock: string[] = [];
  let unclaimed: number[] = [];
  for (let index = top - 1; index >= Math.max(0, top - 12); index -= 1) {
    const row = rows[index] as ScreenRow;
    const text = withoutScrollbar(trimmedText(row));
    const first = [...text][0];
    if (first === undefined || TOASTS.some((toast) => text.includes(toast))) continue;
    const indent = rowIndent(row) ?? 0;
    if (first === '▾' || first === '▸') {
      const name = trimBlanks([...text].slice(1).join(''));
      // `▾ show N more` closes a section rather than opening one.
      if (name.startsWith('show ') && name.endsWith(' more')) continue;
      if (!unclaimed.every((claimed) => claimed > indent)) break;
      unclaimed = [];
      dock.unshift(name);
      continue;
    }
    if (isDockItem(text)) continue;
    const code = first.codePointAt(0) ?? 0;
    if (unclaimed.length === 0 && code >= 0x2800 && code <= 0x28ff) {
      return { status: statusRowOf(index, text), cue: null, dock };
    }
    if (unclaimed.length === 0 && CUE_ICONS.has(first)) {
      return { status: null, cue: trimBlanks([...text].slice(1).join('')), dock };
    }
    unclaimed.push(indent);
  }
  return { status: null, cue: null, dock };
}

/** How the labels of waits a message ends begin (`acp/tracker.rs` `WaitingReason::label`), digits read as `#`. */
const SENDABLE_WAIT_STEMS = [
  'Waiting for subagent',
  'Waiting for # subagents',
  'Waiting on task output',
  'Waiting on tasks',
  'Sleeping',
];
/** Labels of other waits that begin the same way. */
const OTHER_WAIT_LABELS = [
  'Waiting…',
  'Waiting for response…',
  'Waiting for the agent to accept the prompt…',
];

/**
 * A label a message would end. A label cut to fit counts when it can only be such a wait; one both
 * kinds begin with, such as `Waiting for…` at 40 columns, counts while the dock lists subagents.
 */
export function isSendableWaitLabel(rawLabel: string, subagentsDocked: boolean): boolean {
  const label = rawLabel.replace(/\d+/gu, '#');
  if (SENDABLE_WAIT_STEMS.some((stem) => label.startsWith(stem))) return true;
  if (!label.endsWith('…') || OTHER_WAIT_LABELS.includes(label)) return false;
  const stem = label.slice(0, -1);
  if (stem === '' || !SENDABLE_WAIT_STEMS.some((candidate) => candidate.startsWith(stem))) {
    return false;
  }
  return subagentsDocked || !OTHER_WAIT_LABELS.some((other) => other.startsWith(stem));
}

export function readOverlay(
  rows: readonly ScreenRow[],
  composer: GrokComposer | null,
): string | null {
  for (const row of rows) {
    const text = withoutScrollbar(trimmedText(row));
    if (
      text.startsWith('┌─ Resume session') ||
      (text.includes('↑↓ nav') && text.includes('d delete')) ||
      (text.startsWith('┃') && text.includes('Rewind to which turn?')) ||
      (text.startsWith('╭─ /btw ') && text.endsWith('[Esc] ╮'))
    ) {
      return text;
    }
  }
  // The slash, `@` and model popups sit on a rule directly above the composer, and their top rule
  // ends with a count.
  if (composer === null || composer.topRow <= 0) return null;
  const rule = rows[composer.topRow - 1] as ScreenRow;
  const ruleText = withoutScrollbar(trimmedText(rule));
  if (
    [...ruleText].length < 10 ||
    ![...ruleText].every((character) => character === '─') ||
    rowIndent(rule) !== rowIndent(rows[composer.topRow] as ScreenRow)
  ) {
    return null;
  }
  for (let index = composer.topRow - 2; index >= Math.max(0, composer.topRow - 24); index -= 1) {
    const text = withoutScrollbar(trimmedText(rows[index] as ScreenRow));
    if (/^─+(?:\d+(?:\/\d+)?─)?$/u.test(text)) {
      return withoutScrollbar(trimmedText(rows[index + 1] as ScreenRow));
    }
  }
  return ruleText;
}

/** A row key, digits or a letter such as `z` or `y`, then the radio mark (herdr's Blocked rule for Grok Build). */
const OPTION_ROW = /^┃\s+[0-9a-z]+\s+\([●○]\)(?:\s|$)/u;

export function readCard(
  rows: readonly ScreenRow[],
): { lowerBound: number; upperBound: number } | null {
  let bottom = -1;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (trimmedText(rows[index] as ScreenRow).startsWith('┃')) {
      bottom = index;
      break;
    }
  }
  if (bottom < 0) return null;
  let top = bottom;
  while (top > 0 && trimmedText(rows[top - 1] as ScreenRow).startsWith('┃')) top -= 1;
  for (let index = top; index <= bottom; index += 1) {
    if (OPTION_ROW.test(trimmedText(rows[index] as ScreenRow))) {
      return { lowerBound: top, upperBound: bottom + 1 };
    }
  }
  return null;
}

/**
 * Whether the prompt has focus, from the footer's hints. With text in the box, a compact footer or
 * the dashboard view's leaves focus unknown, so it reads as unfocused.
 */
export function readPromptHasFocus(footer: string | null, composer: GrokComposer | null): boolean {
  if (footer === null) return false;
  if (footer.includes('Shift+Tab:mode') || footer.includes('accept suggestion')) return true;
  const onlyTheBoxTells = footer === 'Ctrl+.:shortcuts' || footer.startsWith('Ctrl+\\:dashboard');
  return onlyTheBoxTells && composer?.draft === '';
}

/**
 * The Welcome menu lists `Resume session … ctrl+r` and `Quit … ctrl+q`. From about 90 columns Grok
 * draws it in a box beside its logo; narrower it stacks the menu under the logo without the box.
 */
export function showsWelcome(rows: readonly ScreenRow[]): boolean {
  const boxed: string[] = [];
  for (const row of rows) {
    const text = trimmedText(row);
    if ([...text].length > 1 && text.startsWith('│') && text.endsWith('│')) {
      boxed.push(trimBlanks(text.slice(1, -1)));
    }
  }
  if (
    boxed.some((text) => text.includes('Resume session') && text.endsWith('ctrl+r')) &&
    boxed.some((text) => text.includes('Quit') && text.endsWith('ctrl+q'))
  ) {
    return true;
  }
  const stacked = rows.map((row) => trimmedText(row));
  return (
    stacked.some((text) => /^Resume session\s{2,}ctrl\+r$/u.test(text)) &&
    stacked.some((text) => /^Quit\s{2,}ctrl\+q$/u.test(text))
  );
}

/** Minimal mode draws its prompt flush left, with `minimal · … /help` above it while idle. */
export function showsMinimalPrompt(rows: readonly ScreenRow[]): boolean {
  return rows.slice(Math.trunc((rows.length * 2) / 3)).some((row) => {
    const text = normalizedSpaces(row.text);
    const trimmed = trimmedText(row);
    return (
      text.startsWith('❯ ') ||
      (text.startsWith('❯') && trimmed === '❯') ||
      (trimmed.startsWith('minimal · ') && trimmed.endsWith('/help'))
    );
  });
}
