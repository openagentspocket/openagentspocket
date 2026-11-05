// Pi's and Oh My Pi's input box as Chat reads it before and after a send (Swift PiInputBoxDetector):
// the stock Pi rule editor above its footer, and OMP's box and band composers. Custom extension
// editors, completion lists, Vim cursors and other composer shapes stay in the terminal rather than
// guessing Enter's role.

import { isOmpPrompt, isOmpStatusBand } from '../../blocked/omp-panel';
import {
  type AnsiScreen,
  isBlankChar,
  normalizedSpaces,
  rowIsBlank,
  type ScreenRow,
  trimBlanks,
  trimmedText,
} from '../../blocked/screen';
import { emptyBox, type InputBoxState } from '../send/input-box';

type PiProgram = 'pi' | 'omp';

const OMP_IDLE_BANDS = ['π > ', '\u{E0B6} \u{F0D57} '];
const OMP_HINT_ICONS = new Set(['\u{F0636}', '\u{F0312}']);
const MAX_EDITOR_ROWS = 12;

/** A rule: ten or more `─`. */
const isRule = (text: string): boolean =>
  [...text].length >= 10 && [...text].every((c) => c === '─');

/**
 * Pi's top rule while a turn runs, `── ⠸ Working ───`: a braille spinner and a label set into it,
 * which extensions may reword. Enter then steers the turn. A scrolled editor's `↑ N more` rule is
 * not one, so a draft too long to show never reads as empty.
 */
const isPiWorkingRule = (text: string): boolean => /^──+ [⠀-⣿] .+ ─+$/u.test(text);

/**
 * Pi's footer stats: context use such as `0.0%/500k` or `?/200k`. Narrow panes cut the row with
 * `...`, possibly before the gauge, so a cut row starting like the token, cost or gauge fields also
 * counts.
 */
function isPiStats(text: string): boolean {
  if (/(?:\d+\.\d%|\?)\/\d+(?:\.\d+)?[kM]?/u.test(text)) return true;
  if (!text.endsWith('...')) return false;
  const first = [...text][0];
  return first !== undefined && (/\p{N}/u.test(first) || '↑↓RWC$?'.includes(first));
}

const isSpinnerBand = (header: string): boolean => {
  const scalars = [...header].slice(0, 3);
  const third = scalars[2]?.codePointAt(0);
  return (
    scalars.length === 3 &&
    scalars[0] === '\u{E0B6}' &&
    scalars[1] === ' ' &&
    third !== undefined &&
    third >= 0x2800 &&
    third <= 0x28ff
  );
};

/**
 * The prompt row without OMP's right-aligned italic hint: before the first message, U+F0636
 * U+F0312 `to change thinking effort`. Only a known hint set apart by at least two blanks is
 * dropped; anything else stays part of the draft.
 */
function ompPromptText(row: ScreenRow): string {
  const runs = [...row.runs];
  while (runs.length > 0 && [...(runs[runs.length - 1]?.text ?? '')].every(isBlankChar)) runs.pop();
  const hint = runs[runs.length - 1];
  if (
    !(
      hint?.style.isItalic &&
      /(?:to change thinking effort|to see \d+ running agents?)\s*$/u.test(hint.text)
    )
  ) {
    return row.text;
  }
  const body = [
    ...runs
      .slice(0, -1)
      .map((run) => run.text)
      .join(''),
  ];
  let gap = 0;
  for (let last = body[body.length - 1]; last !== undefined; last = body[body.length - 1]) {
    if (!isBlankChar(last) && !OMP_HINT_ICONS.has(last)) break;
    gap = isBlankChar(last) ? gap + 1 : 0;
    body.pop();
  }
  return gap >= 2 ? body.join('') : row.text;
}

/**
 * OMP draws its default composer as a filled status band followed by an unboxed `╰─ ` prompt;
 * agent.read omits the hardware cursor. The band's leading segment says whether OMP takes a
 * message: idle shows `π > ` (18.10.4 unicode preset) or U+E0B6 then U+F0D57 (18.11.1 nerd preset,
 * plan mode included); a running turn swaps that glyph for a braille spinner and elapsed time. Any
 * other band, such as the ASCII preset or a focused subagent, stays unrecognized. Approval and ask
 * panels sit directly on the band without replacing the prompt. Every row after the prompt is
 * consumed so a multiline draft cannot look empty.
 */
function ompBand(screen: AnsiScreen): InputBoxState | null {
  const rows = screen.rows;
  let prompt = -1;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row && isOmpPrompt(row)) {
      prompt = index;
      break;
    }
  }
  const band = rows[prompt - 1];
  if (prompt <= 0 || !band || !isOmpStatusBand(band)) return null;
  const header = trimmedText(band);
  let working: boolean;
  if (OMP_IDLE_BANDS.some((idle) => header.startsWith(idle))) working = false;
  else if (isSpinnerBand(header)) working = true;
  else return null;
  const above = rows[prompt - 2];
  if (prompt > 1 && above && trimmedText(above).endsWith('╯')) {
    return { kind: 'overlay', row: trimmedText(above) };
  }
  const lines: string[] = [];
  for (let index = prompt; index < rows.length; index += 1) {
    const row = rows[index] as ScreenRow;
    const value = index === prompt ? [...ompPromptText(row)].slice(3).join('') : row.text;
    const text = trimBlanks(value);
    if (text === '') continue;
    // Suggestions and hints are not editor continuation rows. Unknown chrome, such as the shell
    // after OMP exits, also stays non-sendable rather than being discarded.
    if (index > prompt && !row.text.startsWith('   ')) return { kind: 'overlay', row: text };
    if (text === '▏') continue;
    lines.push(text);
  }
  const draft = lines.join('\n');
  if (draft.startsWith('!')) return { kind: 'shellMode', command: draft };
  if (draft !== '') return { kind: 'text', text: draft };
  // Enter while a turn runs steers it, and OMP backgrounds a running bash command to take the message.
  return working
    ? {
        kind: 'disabled',
        reason: "Oh My Pi is working. Send once it's idle, or steer from the terminal.",
      }
    : emptyBox();
}

/** Reads the editor of Pi or Oh My Pi: empty, a draft, shell mode, an overlay, or not recognized. */
export function readPiInputBox(screen: AnsiScreen, program: PiProgram): InputBoxState {
  if (program === 'omp') {
    const band = ompBand(screen);
    if (band) return band;
  }
  const rows = screen.rows;
  // Prefer the last editor on screen; rules in a tool's output above it must never be mistaken
  // for the input box.
  for (let bottom = rows.length - 1; bottom >= 0; bottom -= 1) {
    const end = trimmedText(rows[bottom] as ScreenRow);
    const rule = isRule(end);
    const boxed = program === 'omp' && end.startsWith('╰') && end.endsWith('╯');
    if (!rule && !boxed) continue;
    let top = bottom - 1;
    while (top >= 0 && bottom - top <= MAX_EDITOR_ROWS) {
      const start = trimmedText(rows[top] as ScreenRow);
      if (
        (rule && (isRule(start) || (program === 'pi' && isPiWorkingRule(start)))) ||
        (boxed && start.startsWith('╭') && start.endsWith('╮'))
      ) {
        break;
      }
      top -= 1;
    }
    if (top < 0 || bottom - top > MAX_EDITOR_ROWS) continue;
    const input = boxed ? rows.slice(top + 1, bottom + 1) : rows.slice(top + 1, bottom);
    if (input.length === 0) continue;
    const hasCursor = input.some(
      (row) =>
        row.runs.some((run) => run.style.isReverse) ||
        (program === 'omp' && row.text.includes('▏')),
    );
    if (!hasCursor) continue;
    if (program === 'pi') {
      // Stock Pi's footer is a pwd row then a stats row, right under the editor; extension
      // statuses may follow. A completion list draws between the editor and the footer.
      let stats = -1;
      for (let index = bottom + 2; index < rows.length; index += 1) {
        if (isPiStats(trimmedText(rows[index] as ScreenRow))) {
          stats = index;
          break;
        }
      }
      if (stats < 0) {
        return {
          kind: 'unknown',
          reason: "Pi's footer is not recognized. Continue in the Agent terminal.",
        };
      }
      if (stats !== bottom + 2) {
        return { kind: 'overlay', row: trimmedText(rows[bottom + 1] as ScreenRow) };
      }
    } else {
      // Every nonblank row below OMP's editors is footer chrome. Suggestions or an extension popup
      // suspend sending.
      for (const row of rows.slice(bottom + 1)) {
        if (rowIsBlank(row)) continue;
        const text = trimmedText(row);
        const lowered = text.toLowerCase();
        if (
          text.startsWith('❯') ||
          text.startsWith('>') ||
          text.startsWith('/') ||
          lowered.includes('esc to') ||
          lowered.includes('escape to')
        ) {
          return { kind: 'overlay', row: text };
        }
      }
    }
    const text: string[] = [];
    for (const row of input) {
      let value = row.text;
      if (boxed) {
        const trimmed = trimBlanks(value);
        if (!trimmed.startsWith('│') && !trimmed.startsWith('╰')) {
          return { kind: 'unknown', reason: 'The OMP editor is not recognized.' };
        }
        value = [...trimmed].slice(1).join('');
        if (value.endsWith('│') || value.endsWith('╯')) value = [...value].slice(0, -1).join('');
        if (value.startsWith('─')) value = [...value].slice(1).join('');
        if (value.endsWith('─')) value = [...value].slice(0, -1).join('');
      }
      // OMP's software insertion caret is chrome, not input.
      if (program === 'omp' && trimBlanks(value) === '▏') value = '';
      const trimmed = trimBlanks(normalizedSpaces(value));
      if (trimmed !== '') text.push(trimmed);
    }
    const draft = text.join('\n');
    if (draft.startsWith('!')) return { kind: 'shellMode', command: draft };
    // Pi's empty editor is exactly one row; extra blank rows are newlines the user typed.
    if (draft === '' && program === 'pi' && input.length !== 1)
      return { kind: 'text', text: draft };
    return draft === '' ? emptyBox() : { kind: 'text', text: draft };
  }
  return {
    kind: 'unknown',
    reason: `The ${program === 'pi' ? 'Pi' : 'Oh My Pi'} input box is not recognized. Continue in the Agent terminal.`,
  };
}
