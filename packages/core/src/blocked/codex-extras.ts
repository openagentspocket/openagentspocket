import { comparable } from './comparable';
import { CODEX_POINTER, numberedOption } from './row-scanner';
import {
  type AnsiScreen,
  contentWidth,
  firstChar,
  isBlankChar,
  rowIsBlank,
  trimmedText,
} from './screen';

const COMPOSER_GLYPHS = new Set(['›', '»', '!']);

/**
 * Codex's composer: a prompt glyph at column 0, bold and neither dim nor reversed. Past prompts
 * in the history are bold and dim; a selected option is reversed. Returns the row, or null.
 */
export function locateCodexComposer(screen: AnsiScreen): { row: number; glyph: string } | null {
  for (let at = screen.rows.length - 1; at >= 0; at -= 1) {
    const row = screen.rows[at];
    const glyph = row ? firstChar(row.text) : undefined;
    const run = row?.runs[0];
    if (!row || glyph === undefined || !COMPOSER_GLYPHS.has(glyph) || !run) continue;
    if (!run.style.isBold || run.style.isDim || run.style.isReverse) continue;
    const next = [...row.text][1];
    if (next !== undefined && !isBlankChar(next)) continue;
    if (numberedOption(row, CODEX_POINTER) !== null) continue;
    return { row: row.index, glyph };
  }
  return null;
}

export const CODEX_PLAN_PROMPT_TITLE = 'Implement this plan?';

/** Whether Codex's Plan-mode selector title sits directly above a first numbered option. */
export function codexPlanPromptShows(screen: AnsiScreen): boolean {
  const { rows } = screen;
  let titleRow = -1;
  for (let at = rows.length - 1; at >= 0; at -= 1) {
    const row = rows[at];
    if (row && trimmedText(row) === CODEX_PLAN_PROMPT_TITLE) {
      titleRow = at;
      break;
    }
  }
  if (titleRow < 0) return false;
  const next = rows.slice(titleRow + 1).find((row) => !rowIsBlank(row));
  return next ? numberedOption(next, CODEX_POINTER)?.number === 1 : false;
}

const QUEUED_HEADING = 'Messages to be submitted after next tool call';

/** Whether Codex's queued-messages notice lists a reply to the question titled `title`. */
export function codexQueuedNoticeShows(title: string, screen: AnsiScreen): boolean {
  let heading = -1;
  for (let at = screen.rows.length - 1; at >= 0; at -= 1) {
    if (screen.rows[at]?.text.includes(QUEUED_HEADING)) {
      heading = at;
      break;
    }
  }
  if (heading < 0) return false;
  const wanted = comparable(title);
  for (const row of screen.rows.slice(heading + 1)) {
    const text = trimmedText(row);
    if (!text.startsWith('↳ >')) continue;
    const shown = comparable(text.slice(3));
    if (shown === wanted) return true;
    // A long title wraps; its first row then runs to the edge.
    if (shown !== '' && wanted.startsWith(shown) && contentWidth(row) >= screen.columns - 1) {
      return true;
    }
  }
  return false;
}
