// Hermes Agent's prompt row as its terminal layouts draw it: `❯` over an idle box, `☤` while a turn
// runs, then the draft, or a placeholder in italics. Read from Hermes's source, not from a recording.
// Another skin's glyph, a profile's name before it, a voice or approval prompt: none reads as a
// prompt, so Chat holds rather than guesses, and a transcript row that echoes a message above the
// real box reads as a draft, which holds too.

import {
  type AnsiScreen,
  firstChar,
  rowIsBlank,
  runEnd,
  trimBlanks,
  trimmedText,
  visibleRuns,
} from '../../blocked/screen';

const IDLE_GLYPH = '❯';
const WORKING_GLYPH = '☤';
/** The box sits at the bottom; rules and a status bar are all that come below it. */
const ROWS_SEARCHED = 12;

export interface HermesPrompt {
  isWorking: boolean;
  /** What the user typed; empty for an empty box. */
  draft: string;
  placeholder: string | null;
}

export function readHermesPrompt(screen: AnsiScreen): HermesPrompt | null {
  const { rows } = screen;
  const last = Math.max(rows.length - ROWS_SEARCHED, 0);
  for (let at = rows.length - 1; at >= last; at -= 1) {
    const row = rows[at];
    if (!row) continue;
    const text = trimmedText(row);
    const glyph = firstChar(text);
    if (glyph !== IDLE_GLYPH && glyph !== WORKING_GLYPH) continue;
    // Anything but the box's rule below it is a draft's next line: this row does not say it all.
    const below = rows[at + 1];
    if (below && !rowIsBlank(below) && !trimmedText(below).startsWith('─')) return null;
    const rest = trimBlanks(text.slice(glyph.length));
    const restStart = row.text.lastIndexOf(rest);
    const isPlaceholder =
      rest !== '' &&
      visibleRuns(row)
        .filter((run) => runEnd(run) > restStart)
        .every((run) => run.style.isItalic);
    return {
      isWorking: glyph === WORKING_GLYPH,
      draft: isPlaceholder ? '' : rest,
      placeholder: isPlaceholder ? rest : null,
    };
  }
  return null;
}
