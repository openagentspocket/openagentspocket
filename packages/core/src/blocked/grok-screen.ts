// The parts of a Grok Build screen the Blocked card reads (Swift GrokScreen, 1.0.62): the footer's
// hints, the card in the composer's place and the dashboard's view of another agent. Grok's colors
// are 24-bit and follow its theme, so the parsers read structure and attributes, never a color.

import { textWidth } from './cell-width';
import { type AnsiScreen, rowIsBlank, type ScreenRow, trimBlanks, trimmedText } from './screen';

/** The text from display column `column` on. A wide character straddling the column is dropped. */
export function textFromColumn(row: ScreenRow, column: number): string {
  let result = '';
  let position = 0;
  for (const character of row.text) {
    if (position >= column) result += character;
    position += textWidth(character);
  }
  return result;
}

/** The row without the scrollbar Grok draws at the right edge of the scrollback and of a card's long list, trimmed. */
export function withoutScrollbar(text: string): string {
  const match = /\s*[█▐▌]+\s*$/u.exec(text);
  return match === null ? text : trimBlanks(text.slice(0, match.index));
}

/** `│ ❯ ` a message, `│ ! ` a shell command, `│ # ` a memory note. */
const isPromptRow = (row: ScreenRow): boolean =>
  ['│ ❯ ', '│ ! ', '│ # '].some((prefix) => trimmedText(row).startsWith(prefix));

/** The row of the composer box's bottom border: the bottom-most box, since popups and panels above it draw boxes too. */
function composerBottom(rows: readonly ScreenRow[]): number | null {
  for (let top = rows.length - 3; top >= 0; top -= 1) {
    const topRow = rows[top];
    const promptRow = rows[top + 1];
    if (!topRow || !promptRow) continue;
    if (!trimmedText(topRow).startsWith('╭─') || !isPromptRow(promptRow)) continue;
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
    if (boxed) return bottom;
  }
  return null;
}

/** A row key, digits or a letter such as `z` or `y`, then the radio mark (herdr's Blocked rule for Grok Build). */
const OPTION_ROW = /^┃\s+[0-9a-z]+\s+\([●○]\)(?:\s|$)/u;

/**
 * The rows of the card in the composer's place, such as a permission, a question or the subagent
 * panel: the bottom-most run of rows that begin with `┃`, when one of them is an option row such as
 * `┃  3 (●) Yes, proceed`, the rule herdr reports Blocked by. The rewind picker draws the same bar
 * without options.
 */
function cardRows(rows: readonly ScreenRow[]): { lowerBound: number; upperBound: number } | null {
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

export interface GrokScreen {
  /** The shortcuts row: the last nonblank row below the composer, or on the screen when no composer shows. */
  footer: string | null;
  card: { lowerBound: number; upperBound: number } | null;
  /**
   * The dashboard's view of one agent (Grok's session overlay): that agent's own view, with
   * `Ctrl+\:dashboard` first in the footer, and `‹ i/n ›` in the header while there are other
   * agents to cycle to. A message or Ctrl+C reaches that agent, which may not be this conversation.
   */
  isDashboardOverlay: boolean;
}

export function readGrokScreen(screen: AnsiScreen): GrokScreen {
  const { rows } = screen;
  const bottom = composerBottom(rows);
  const below = bottom === null ? 0 : bottom + 1;
  let footer: string | null = null;
  for (let index = rows.length - 1; index >= below; index -= 1) {
    const row = rows[index] as ScreenRow;
    if (!rowIsBlank(row)) {
      footer = trimmedText(row);
      break;
    }
  }
  const header = rows.slice(0, 2).some((row) => /‹ \d+\/\d+ ›/u.test(row.text));
  return {
    footer,
    card: cardRows(rows),
    isDashboardOverlay: (footer?.startsWith('Ctrl+\\:dashboard') ?? false) || header,
  };
}
