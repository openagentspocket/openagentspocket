/** Unicode White_Space, spelled out so it does not depend on the engine's property tables. */
const WHITE_SPACE = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004,
  0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
]);

/**
 * Text in the form the fingerprint and label comparisons use: no whitespace at all, so wrapping
 * at any width reads the same, and a typographic apostrophe read as a plain one.
 */
export function comparable(text: string): string {
  let result = '';
  for (const character of text) {
    const value = character.codePointAt(0) ?? 0;
    if (WHITE_SPACE.has(value)) continue;
    result += value === 0x2019 ? "'" : character;
  }
  return result;
}
