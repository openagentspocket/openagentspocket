import { describe, expect, it } from 'vitest';
import { catalogs } from './catalogs.generated';
import { appExtras, keysOf, setLocale, t } from './index';

describe('app extras', () => {
  it('ship every key in English and Spanish', () => {
    expect(Object.keys(appExtras.es).sort()).toEqual(Object.keys(appExtras.en).sort());
  });

  it('never shadow a Swift key (the Swift catalog would win and the extra would be dead)', () => {
    const swift = new Set(Object.keys(catalogs.en.app));
    expect(Object.keys(appExtras.en).filter((key) => swift.has(key))).toEqual([]);
  });

  it('resolve through t() as part of the app table', () => {
    const [key] = Object.keys(appExtras.en);
    expect(keysOf('app')).toContain(key);
    setLocale('es');
    expect(t('Switch Agent')).toBe(appExtras.es['Switch Agent']);
    setLocale('en');
  });
});
