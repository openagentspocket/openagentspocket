/** The locales the catalogs ship, English first (the Swift app's development language). */
export const locales = ['en', 'es'] as const;
export type Locale = (typeof locales)[number];

export type PluralCategory = 'one' | 'many' | 'other';

/**
 * CLDR cardinal plural rules for the shipped locales, so plurals don't depend on the engine's
 * Intl.PluralRules (Hermes doesn't ship it everywhere). Tests pin them against Node's Intl.
 *   en: one → i = 1 and v = 0
 *   es: one → n = 1; many → i != 0 and i % 1000000 = 0 and v = 0; other
 */
export function pluralCategory(locale: Locale, value: number): PluralCategory {
  const n = Math.abs(value);
  const integer = Number.isInteger(n);
  if (locale === 'es') {
    if (n === 1) return 'one';
    if (integer && n !== 0 && n % 1_000_000 === 0) return 'many';
    return 'other';
  }
  return integer && n === 1 ? 'one' : 'other';
}
