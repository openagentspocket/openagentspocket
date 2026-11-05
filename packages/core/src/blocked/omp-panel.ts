// An Oh My Pi panel as the dialog parser finds it (Swift OMPPanel): a rounded box titled in its top
// border, `╭─ Allow tool: bash ─…╮`, with `├─…┤` rules between its sections and its key hints in the
// last one.

import {
  type AnsiScreen,
  isBlankChar,
  rowIsBlank,
  type ScreenRow,
  trimBlanks,
  trimmedText,
} from './screen';

export interface OmpLine {
  /** The text between the side borders, trimmed. */
  readonly text: string;
  /** Blank cells between the left border and the text. */
  readonly indent: number;
  readonly row: ScreenRow;
}

export interface OmpPanel {
  /** The zero-based screen rows from the top border (or the screen's top when it is off screen) through the bottom border, half open. */
  readonly rows: { readonly lowerBound: number; readonly upperBound: number };
  /** The title from the top border, without a countdown such as `(30s)`; null when the top border is off screen. */
  readonly title: string | null;
  /** The rows between the side borders, blank ones dropped, split at each `├─…┤` rule. */
  readonly sections: readonly (readonly OmpLine[])[];
}

/** OMP's unboxed `╰─` prompt row under the status band (herdr pads ANSI rows to the pane width). */
export const isOmpPrompt = (row: ScreenRow): boolean =>
  row.text.startsWith('╰─ ') || row.text === '╰─';

/** OMP's status band: a filled row with rules and a context gauge. */
export const isOmpStatusBand = (row: ScreenRow): boolean =>
  row.text.includes('─') &&
  /\d{1,3}%/.test(row.text) &&
  row.runs.some((run) => run.style.background !== null);

const isBottomBorder = (row: ScreenRow): boolean => {
  const text = trimmedText(row);
  return text.startsWith('╰') && text.endsWith('╯');
};

/** `╭─ Title ─…╮`: exactly one rule cell, a space, then the title. */
function titleOf(border: string): string | null {
  if (!border.startsWith('╭─ ')) return null;
  const rest = border.slice(3);
  const first = [...rest][0];
  if (first === undefined || first === '─' || isBlankChar(first)) return null;
  const found = rest.indexOf(' ─');
  const end = found >= 0 ? found : rest.length - 1;
  const title = trimBlanks(rest.slice(0, end).replace(/\s*\(\d+s\)$/, ''));
  return title === '' ? null : title;
}

/**
 * The lowest panel, when it ends the screen or rests on the status band. An untitled panel is a
 * tool's rendering, not a dialog.
 */
export function bottomPanel(screen: AnsiScreen): OmpPanel | null {
  const { rows } = screen;
  let last = -1;
  for (let at = rows.length - 1; at >= 0; at -= 1) {
    if (!rowIsBlank(rows[at] as ScreenRow)) {
      last = at;
      break;
    }
  }
  if (last < 0) return null;
  let bottom: number;
  let prompt = -1;
  for (let at = rows.length - 1; at >= 0; at -= 1) {
    if (isOmpPrompt(rows[at] as ScreenRow)) {
      prompt = at;
      break;
    }
  }
  if (isBottomBorder(rows[last] as ScreenRow)) {
    bottom = last;
  } else if (
    prompt >= 2 &&
    isOmpStatusBand(rows[prompt - 1] as ScreenRow) &&
    isBottomBorder(rows[prompt - 2] as ScreenRow)
  ) {
    bottom = prompt - 2;
  } else {
    return null;
  }
  const sections: OmpLine[][] = [[]];
  let index = bottom - 1;
  while (index >= 0) {
    const row = rows[index] as ScreenRow;
    const text = trimmedText(row);
    if (text.startsWith('╭') && text.endsWith('╮')) break;
    if (text.startsWith('├') && text.endsWith('┤')) {
      sections.unshift([]);
    } else if (text.startsWith('│') && text.endsWith('│') && [...text].length >= 2) {
      const inner = [...text].slice(1, -1).join('');
      const trimmed = trimBlanks(inner);
      if (trimmed !== '') {
        let indent = 0;
        for (const character of inner) {
          if (!isBlankChar(character)) break;
          indent += 1;
        }
        (sections[0] as OmpLine[]).unshift({ text: trimmed, indent, row });
      }
    } else {
      return null;
    }
    index -= 1;
  }
  if (index < 0) return { rows: { lowerBound: 0, upperBound: bottom + 1 }, title: null, sections };
  const title = titleOf(trimmedText(rows[index] as ScreenRow));
  if (title === null) return null;
  return { rows: { lowerBound: index, upperBound: bottom + 1 }, title, sections };
}
