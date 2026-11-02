import { afterEach, describe, expect, it } from 'vitest';
import {
  deviceLocaleTag,
  getLocale,
  getLocaleTag,
  message,
  resolveLocale,
  setLocale,
  t,
  translate,
} from './index';

describe('t()', () => {
  afterEach(() => {
    setLocale('en');
  });

  it('renders the current locale and falls back to English for other languages', () => {
    expect(setLocale('es-AR')).toBe('es');
    expect(getLocale()).toBe('es');
    expect(getLocaleTag()).toBe('es-AR');
    expect(t('Needs you')).toBe(translate('es', 'app', 'Needs you'));
    expect(t('Needs you')).not.toBe(translate('en', 'app', 'Needs you'));
    expect(setLocale('fr-FR')).toBe('en');
    expect(t('Needs you')).toBe(translate('en', 'app', 'Needs you'));
  });

  it('passes positional and named arguments through', () => {
    setLocale('es');
    const pair = t('%lld of %lld', 2, 5);
    expect(pair).toContain('2');
    expect(pair).toContain('5');
    const reordered = t('%@ session version %lld', '«s»', 7);
    expect(reordered).toContain('«s»');
    expect(reordered).toContain('7');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: an App Intents key, not a template
    expect(t('Open ${agent}', { agent: '«a»' })).toContain('«a»');
  });

  it('formats counts with the region of the locale tag', () => {
    setLocale('es-AR');
    expect(t('%lld more', 12345)).toContain(new Intl.NumberFormat('es-AR').format(12345));
    setLocale('en-US');
    expect(t('%lld more', 12345)).toContain('12,345');
  });

  it('renders an unknown key as itself, like Foundation', () => {
    expect(translate('es', 'app', 'No such key')).toBe('No such key');
    expect(message('es', 'app', 'No such key')).toBeUndefined();
  });
});

describe('resolveLocale', () => {
  it('picks the first shipped language, else English', () => {
    expect(resolveLocale(['fr-FR', 'es-MX', 'en-US'])).toBe('es');
    expect(resolveLocale(['en_GB'])).toBe('en');
    expect(resolveLocale(['de'])).toBe('en');
    expect(resolveLocale([])).toBe('en');
  });

  it('reads a device tag from the engine', () => {
    expect(deviceLocaleTag()).toMatch(/^[a-z]{2,3}/i);
  });
});
