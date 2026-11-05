// Codex's composer as Chat reads it before and after a send (Swift InputBoxStateDetector, Codex
// section).

import {
  CODEX_PLAN_PROMPT_TITLE,
  codexPlanPromptShows,
  locateCodexComposer,
} from '../../blocked/codex-extras';
import { runsFrom } from '../../blocked/row-scanner';
import {
  type AnsiScreen,
  isBlankRun,
  normalizedSpaces,
  rowIndent,
  rowIsBlank,
  trimBlanks,
  trimmedText,
} from '../../blocked/screen';
import { emptyBox, type InputBoxState } from '../send/input-box';

/** The composer's placeholders. A narrow screen can cut them short. */
const PLACEHOLDERS = ['Ask Codex to do anything', 'Ask a follow-up question'];

const isBlankAt = (rows: AnsiScreen['rows'], at: number): boolean => {
  const row = rows[at];
  return row !== undefined && rowIsBlank(row);
};

/** Transient hints under the composer and popups drawn above it. */
function overlayAround(composerRow: number, screen: AnsiScreen): string | null {
  const rows = screen.rows;
  const hints = ['again to quit', 'to edit previous message', 'reverse-i-search', 'esc close'];
  for (const row of rows.slice(composerRow + 1)) {
    if (rowIsBlank(row)) continue;
    const text = trimmedText(row);
    if (hints.some((hint) => text.includes(hint))) return text;
  }
  let index = composerRow - 1;
  if (index >= 0 && isBlankAt(rows, index)) index -= 1;
  for (let row = rows[index]; row && !rowIsBlank(row); row = rows[index]) {
    const text = trimmedText(row);
    if (
      text === 'Keyboard shortcuts' ||
      text.includes('esc close') ||
      /^(›\s+)?\/[\w:-]+\s{2,}\S/u.test(text)
    ) {
      return text;
    }
    index -= 1;
  }
  return null;
}

/** A dim `›` with Codex's disabled-input text in place of the placeholder. */
function disabledReason(screen: AnsiScreen): string | null {
  for (const row of [...screen.rows].reverse()) {
    const run = row.runs[0];
    if (row.text[0] !== '›' || !run || !run.style.isDim || run.style.isBold) continue;
    const text = trimBlanks(trimmedText(row).slice(1));
    if (text.startsWith('Input disabled') || text.includes('direct input is disabled')) return text;
  }
  return null;
}

export function readCodexInputBox(screen: AnsiScreen): InputBoxState {
  const composer = locateCodexComposer(screen);
  if (!composer) {
    const reason = disabledReason(screen);
    return reason !== null
      ? { kind: 'disabled', reason }
      : { kind: 'unknown', reason: "Codex's composer is not on screen." };
  }
  const rows = screen.rows;
  const row = rows[composer.row];
  const runs = row ? runsFrom(row, 2) : [];
  const firstLine = trimBlanks(normalizedSpaces(runs.map((run) => run.text).join('')));
  const lines = firstLine === '' ? [] : [firstLine];
  // A draft continues at column 2 until a blank row.
  let next = composer.row + 1;
  for (let following = rows[next]; following; following = rows[next]) {
    if (rowIsBlank(following) || (rowIndent(following) ?? 0) < 2) break;
    lines.push(trimmedText(following));
    next += 1;
  }
  const visible = runs.filter((run) => !isBlankRun(run));
  if (composer.glyph === '!') return { kind: 'shellMode', command: lines.join('\n') };
  if (lines.length === 0) {
    return { kind: 'unknown', reason: "Codex's composer shows neither text nor its placeholder." };
  }
  if (lines.length === 1 && visible.length > 0 && visible.every((run) => run.style.isDim)) {
    const shown = firstLine.endsWith('…') ? firstLine.slice(0, -1) : firstLine;
    if (!PLACEHOLDERS.some((placeholder) => placeholder.startsWith(shown))) {
      return {
        kind: 'unknown',
        reason: `The composer shows “${firstLine}”, which Agentico does not know.`,
      };
    }
    const overlay = overlayAround(composer.row, screen);
    return overlay !== null ? { kind: 'overlay', row: overlay } : emptyBox(firstLine);
  }
  return { kind: 'text', text: lines.join('\n') };
}

/** The Plan-mode selector holds the box under a dialog no card names; its title says so. */
export function codexDialogTitle(screen: AnsiScreen): string | null {
  return codexPlanPromptShows(screen) ? CODEX_PLAN_PROMPT_TITLE : null;
}
