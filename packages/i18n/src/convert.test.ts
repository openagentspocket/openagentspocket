import { describe, expect, it } from 'vitest';
import { convertCatalog, convertEntry, specifiersOf } from '../scripts/xcstrings.mjs';
import { formatMessage } from './format';

const unit = (value: string) => ({ stringUnit: { state: 'translated', value } });
const plural = (cases: Record<string, string>) => ({
  variations: {
    plural: Object.fromEntries(Object.entries(cases).map(([k, v]) => [k, unit(v)])),
  },
});
const entry = (es: object, en?: object) => ({ localizations: { es, ...(en ? { en } : {}) } });

describe('xcstrings converter', () => {
  it('maps %@ and %lld to positional ICU arguments, keeping their type', () => {
    expect(convertEntry('%@ has %lld', entry(unit('%1$@ tiene %2$lld')))).toEqual({
      en: '{0} has {1, number}',
      es: '{0} tiene {1, number}',
    });
  });

  it('keeps reordered positional arguments on the right value', () => {
    const { es } = convertEntry(
      '%@ session version %lld',
      entry(unit('la versión %2$lld de la sesión de %1$@')),
    );
    expect(formatMessage(es, ['Claude', 3], 'es')).toContain('3');
    expect(es.indexOf('{1, number}')).toBeLessThan(es.indexOf('{0}'));
  });

  it('turns %% into a percent sign only in format strings', () => {
    expect(convertEntry('Uploading… %lld%%', entry(unit('Subiendo… %lld%%'))).es).toBe(
      'Subiendo… {0, number}%',
    );
    const literal = 'Under %ProgramData%\\ssh, 100%%';
    expect(convertEntry(literal, entry(unit(literal))).es).toBe(literal);
  });

  it('converts plural variations with # for the count', () => {
    const { en, es } = convertEntry(
      '%lld days',
      entry(
        plural({ one: '%lld día', other: '%lld días' }),
        plural({ one: '%lld day', other: '%lld days' }),
      ),
    );
    expect(en).toBe('{0, plural, one {# day} other {# days}}');
    expect(es).toBe('{0, plural, one {# día} other {# días}}');
  });

  it("maps Apple's zero case to an exact match and allows a case without the count", () => {
    const { es } = convertEntry(
      '%lld files',
      entry(plural({ zero: 'Ninguno', one: 'Un archivo', other: '%lld archivos' })),
    );
    expect(es).toBe('{0, plural, =0 {Ninguno} one {Un archivo} other {# archivos}}');
  });

  it('turns App Intents placeholders into named arguments', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: an App Intents key, not a template
    expect(convertEntry('Open ${agent}', entry(unit('Abrí ${agent}'))).es).toBe('Abrí {agent}');
  });

  it('escapes ICU syntax in literal text so it renders unchanged', () => {
    const source = "Can't use \"@{\" or {x} in '%@'";
    const { en } = convertEntry(source, {});
    expect(formatMessage(en, ['v'], 'en')).toBe("Can't use \"@{\" or {x} in 'v'");
    const hash = convertEntry('%lld #tags', entry(plural({ one: '# %lld', other: '# %lld' }))).es;
    expect(formatMessage(hash, [2], 'es')).toBe('# 2');
  });

  it('falls back to English for keys marked not to translate', () => {
    expect(convertEntry('%@ · %@', { shouldTranslate: false })).toEqual({
      en: '{0} · {1}',
      es: '{0} · {1}',
    });
  });

  it('fails loudly on what it cannot convert faithfully', () => {
    expect(() => specifiersOf('%.1f%%')).toThrow(/unsupported format specifier/);
    expect(() =>
      convertEntry('%lld of %lld', entry(plural({ one: '%lld de %lld', other: '%lld de %lld' }))),
    ).toThrow(/exactly one numeric argument/);
    expect(() =>
      convertEntry('x', entry({ variations: { device: { iphone: unit('x') } } })),
    ).toThrow(/unsupported variations/);
  });

  it('skips stale keys and keeps the rest in catalog order', () => {
    const out = convertCatalog({
      sourceLanguage: 'en',
      strings: { B: entry(unit('b')), Gone: { extractionState: 'stale' }, A: entry(unit('a')) },
    });
    expect(Object.keys(out.es)).toEqual(['B', 'A']);
    expect(out.skipped).toEqual(['Gone']);
  });
});

describe('brand', () => {
  it('says the product name in values, never in keys', () => {
    const key = 'Open Agentico on %@';
    const out = convertCatalog({
      strings: { [key]: entry(unit('Abri Agentico en %@'), unit('Open Agentico on %@')) },
    });
    expect(Object.keys(out.en)).toEqual([key]);
    expect(out.en[key]).toBe('Open OpenAgentsPocket on {0}');
    expect(out.es[key]).toBe('Abri OpenAgentsPocket en {0}');
  });

  it('only rewrites the whole word', () => {
    expect(convertEntry('k', entry(unit('Agenticoish AgenticoX')), 'k').es).toBe(
      'Agenticoish AgenticoX',
    );
  });
});
