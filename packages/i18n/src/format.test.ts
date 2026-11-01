import { IntlMessageFormat } from 'intl-messageformat';
import { describe, expect, it } from 'vitest';
import { formatMessage, MessageSyntaxError, messageArguments } from './format';
import { type Locale, pluralCategory } from './plural';

const reference = (message: string, values: Record<string, unknown>, locale: Locale) =>
  String(
    new IntlMessageFormat(message, locale, undefined, { ignoreTag: true }).format(
      values as Record<string, string>,
    ),
  );

describe('pluralCategory', () => {
  it.each(['en', 'es'] as const)('matches CLDR (Intl.PluralRules) for %s', (locale) => {
    const rules = new Intl.PluralRules(locale);
    for (const n of [0, 1, 2, 3, 5, 11, 21, 100, 1000, 1_000_000, 2_000_000, 1.5, -1]) {
      expect(pluralCategory(locale, n), `${locale} ${n}`).toBe(rules.select(n));
    }
  });
});

describe('formatMessage', () => {
  const cases: [string, unknown[] | Record<string, unknown>][] = [
    ['plain text', []],
    ['{0} and {1}', ['a', 'b']],
    ['{1} before {0}', ['a', 'b']],
    ['{0, number} items', [12345]],
    ['{0, plural, one {# Agent} other {# Agents}}', [1]],
    ['{0, plural, one {# Agent} other {# Agents}}', [3]],
    ['{0, plural, =0 {none} one {one} other {#}}', [0]],
    ['{0, plural, one {# más de {1}} other {# más de {1}}}', [2, 'x']],
    ['Task #{0}: {1}', ['7', 'fix']],
    ['contain "@\'{\'"', []],
    ["it''s {0}", ['x']],
    ["don't", []],
    ['Open {agent} in {applicationName}', { agent: 'a', applicationName: 'b' }],
    ["{0, plural, one {'#' # item} other {'#' # items}}", [1_000_000]],
  ];

  it.each(cases)('agrees with intl-messageformat: %s', (message, args) => {
    const values = Array.isArray(args) ? Object.fromEntries(args.map((v, i) => [i, v])) : args;
    for (const locale of ['en', 'es'] as const) {
      expect(formatMessage(message, args, locale)).toBe(reference(message, values, locale));
    }
  });

  it('picks plural rules from the locale and number format from the tag', () => {
    const message = '{0, plural, one {one} other {# other}}';
    expect(formatMessage(message, [1], 'es')).not.toBe(formatMessage(message, [2], 'es'));
    const grouped = formatMessage('{0, number}', [1234567], 'en', 'es-AR');
    expect(grouped).toBe(new Intl.NumberFormat('es-AR').format(1234567));
  });

  it('leaves a missing argument visible instead of throwing', () => {
    expect(formatMessage('{0} and {1}', ['a'], 'en')).toContain('{1}');
  });

  it('rejects syntax outside the supported subset', () => {
    for (const bad of ['{0, select, a {x} other {y}}', '{0', '}', '{0, plural, one {x}}']) {
      expect(() => formatMessage(bad, [], 'en'), bad).toThrow(MessageSyntaxError);
    }
  });

  it('lists the arguments a message reads, plurals as numbers', () => {
    const args = messageArguments('{1}: {0, plural, one {# {2, number}} other {#}}');
    expect(Object.fromEntries(args)).toEqual({ 0: 'number', 1: 'string', 2: 'number' });
  });
});
