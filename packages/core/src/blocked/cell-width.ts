/**
 * How many terminal cells a character covers, by the rules a terminal grid such as herdr's
 * applies (Swift's TerminalCellWidth): East Asian wide and fullwidth characters and emoji with
 * emoji presentation take two, combining marks and format characters none, everything else one.
 */

/** East Asian Wide and Fullwidth blocks (UAX #11), coarsened to whole blocks. */
const WIDE_RANGES: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2329, 0x232a],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xa960, 0xa97f],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x16fe0, 0x16fe4],
  [0x17000, 0x18cff],
  [0x1b000, 0x1b2ff],
  [0x1f200, 0x1f2ff],
  [0x20000, 0x2fffd],
  [0x30000, 0x3fffd],
];

const ZERO_WIDTH = /^[\p{Mn}\p{Me}\p{Cf}]$/u;
const EMOJI_PRESENTATION = /^\p{Emoji_Presentation}$/u;
const EMOJI = /^\p{Emoji}$/u;
const VARIATION_SELECTOR_16 = 0xfe0f;

function isWide(value: number): boolean {
  let low = 0;
  let high = WIDE_RANGES.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const range = WIDE_RANGES[middle];
    if (!range) return false;
    if (value < range[0]) high = middle - 1;
    else if (value > range[1]) low = middle + 1;
    else return true;
  }
  return false;
}

/** The width of one code point. */
export function scalarWidth(value: number): number {
  if (value < 0x20 || (value >= 0x7f && value < 0xa0)) return 0;
  if (value < 0x300) return 1;
  const character = String.fromCodePoint(value);
  if (ZERO_WIDTH.test(character)) return 0;
  if (value >= 0x1160 && value <= 0x11ff) return 0;
  if (isWide(value) || EMOJI_PRESENTATION.test(character)) return 2;
  return 1;
}

/** The width of a text: a one-cell emoji followed by U+FE0F takes two. */
export function textWidth(text: string): number {
  let total = 0;
  let previous: { value: number; width: number } | undefined;
  for (const character of text) {
    const value = character.codePointAt(0) ?? 0;
    if (
      value === VARIATION_SELECTOR_16 &&
      previous?.width === 1 &&
      EMOJI.test(String.fromCodePoint(previous.value))
    ) {
      total += 1;
      previous = { value: previous.value, width: 2 };
      continue;
    }
    const width = scalarWidth(value);
    total += width;
    previous = { value, width };
  }
  return total;
}
