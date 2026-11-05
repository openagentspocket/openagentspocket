// How the generic card draws an Oh My Pi panel (Swift OMPDialogParser.displayLines): the title, then
// each section's rows between the side borders, a rule between sections. Rows keep their indent
// inside the panel, so options line up under the pointer; OMP's nerd-font symbols are mapped to the
// system font's or dropped.

import type { OmpPanel } from './omp-panel';
import { isBlankChar } from './screen';

/** Marks a rule between sections (Swift `GenericDialogExcerpt.ruleLine`). */
export const RULE_LINE = '───';

/** From OMP's nerd-font symbol table, with the Unicode symbols of its plain table. */
const DISPLAY_GLYPHS: ReadonlyMap<string, string> = new Map([
  ['\u{F054}', '❯'],
  ['\u{F096}', '☐'],
  ['\u{F14A}', '☑'],
  ['\u{F10C}', '○'],
  ['\u{F192}', '◉'],
]);

/** The Private Use Areas, where nerd fonts put their icons. */
const isPrivateUse = (value: number): boolean =>
  (value >= 0xe000 && value <= 0xf8ff) || value >= 0xf0000;

/**
 * `text` with OMP's nerd-font symbols as the system font draws them: the pointer, check boxes and
 * radios mapped, any other Private Use Area glyph, such as a key icon in the hints, dropped with its
 * space.
 */
export function displayText(text: string): string {
  let result = '';
  let skipsBlank = false;
  for (const character of text) {
    if (skipsBlank && isBlankChar(character)) {
      skipsBlank = false;
      continue;
    }
    skipsBlank = false;
    const mapped = DISPLAY_GLYPHS.get(character);
    if (mapped !== undefined) result += mapped;
    else if (isPrivateUse(character.codePointAt(0) ?? 0)) skipsBlank = true;
    else result += character;
  }
  return result;
}

export function displayLinesOf(panel: OmpPanel): string[] {
  const lines = panel.title === null ? [] : [displayText(panel.title)];
  let hasSection = false;
  for (const section of panel.sections) {
    if (section.length === 0) continue;
    if (hasSection) lines.push(RULE_LINE);
    for (const line of section) {
      lines.push(' '.repeat(Math.max(0, line.indent - 1)) + displayText(line.text));
    }
    hasSection = true;
  }
  return lines;
}
