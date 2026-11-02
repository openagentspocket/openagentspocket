// The checked-in JSON against the Swift catalogs it came from. Runs only where the Swift checkout
// is present ($AGENTICO_SWIFT_DIR, else a sibling `Agentico` folder of this repo).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { convertSwiftCatalogs, specifiersOf } from '../scripts/xcstrings.mjs';
import { catalogSources, formatMessage, type Locale, locales, message, type Table } from './index';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const swiftDir = resolve(process.env.AGENTICO_SWIFT_DIR ?? join(root, '../../../Agentico'));
const hasSwift = existsSync(join(swiftDir, 'Sources'));

type Unit = { stringUnit?: { value: string } };
type Localization = Unit & { variations?: { plural?: Record<string, Unit> } };
type Entry = { localizations?: Record<string, Localization>; extractionState?: string };

// The count that selects each Apple plural case in both shipped languages.
const COUNT: Record<string, number> = { zero: 0, one: 1, many: 1_000_000, other: 3 };

/** What Foundation prints: specifiers replaced by sentinels / the formatted count. */
function swiftRender(text: string, format: boolean, locale: Locale, count?: number) {
  if (!format) return text.replace(/\$\{(\w+)\}/g, '«$1»');
  let next = 0;
  return text
    .replace(/%%|%(?:(\d+)\$)?(?:ll|l)?([@d])/g, (match, position?: string) => {
      if (match === '%%') return '%';
      const index = position ? Number(position) - 1 : next++;
      const [{ kind }] = specifiersOf(match.replace(/^%\d+\$/, '%'));
      if (kind === 'number' && count !== undefined)
        return new Intl.NumberFormat(locale).format(count);
      return `«${index}»`;
    })
    .replace(/\$\{(\w+)\}/g, '«$1»');
}

describe.skipIf(!hasSwift)('Swift catalogs', () => {
  const converted = hasSwift ? convertSwiftCatalogs(swiftDir) : [];

  it('are the source of the checked-in JSON (run `pnpm -F @openagentspocket/i18n convert`)', () => {
    expect(
      Object.fromEntries(converted.map((c: { table: string; path: string }) => [c.table, c.path])),
    ).toEqual(catalogSources);
    for (const { table, en, es } of converted) {
      for (const [locale, fresh] of [
        ['en', en],
        ['es', es],
      ] as const) {
        const file = join(root, `src/catalogs/${locale}/${table}.json`);
        expect(JSON.parse(readFileSync(file, 'utf8')), `${locale}/${table}`).toEqual(fresh);
      }
    }
  });

  it('convert losslessly: every Swift value (voseo included) renders back unchanged', () => {
    let checked = 0;
    for (const [table, path] of Object.entries(catalogSources)) {
      const catalog = JSON.parse(readFileSync(join(swiftDir, path), 'utf8'));
      for (const [key, entry] of Object.entries(catalog.strings as Record<string, Entry>)) {
        if (entry.extractionState === 'stale') continue;
        const format = specifiersOf(key).length > 0;
        for (const locale of locales) {
          const icu = message(locale, table as Table, key) ?? '';
          const localization = entry.localizations?.[locale] ?? entry.localizations?.en;
          const strings = Object.fromEntries(
            [...key.matchAll(/\$\{(\w+)\}/g)].map((m) => [m[1], `«${m[1]}»`]),
          );
          const sentinels = specifiersOf(key).map(({ index }: { index: number }) => `«${index}»`);
          const args = {
            ...strings,
            ...Object.fromEntries(sentinels.map((s: string, i: number) => [i, s])),
          };
          const cases = localization?.variations?.plural ?? {
            other: localization?.stringUnit ? localization : { stringUnit: { value: key } },
          };
          for (const [category, unit] of Object.entries(cases)) {
            const plural = localization?.variations?.plural !== undefined;
            const count = plural ? COUNT[category] : undefined;
            const values = count === undefined ? args : withCount(icu, args, count);
            const expected = swiftRender(unit.stringUnit?.value ?? '', format, locale, count);
            expect(
              formatMessage(icu, values, locale),
              `${table} ${locale} ${key} ${category}`,
            ).toBe(expected);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(5000);
  });
});

/** Puts the count on the plural's argument; the other arguments keep their sentinels. */
function withCount(icu: string, args: Record<string, string>, count: number) {
  const match = icu.match(/^\{(\w+), plural,/);
  return match?.[1] === undefined ? args : { ...args, [match[1]]: count };
}
