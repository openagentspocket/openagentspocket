import { IntlMessageFormat } from 'intl-messageformat';
import { describe, expect, it } from 'vitest';
import { specifiersOf } from '../scripts/xcstrings.mjs';
import { keysOf, locales, message, messageArguments, type Table, tables, translate } from './index';

// Sample values per argument kind: strings get a sentinel, numbers pick each plural branch.
const samples = (icu: string, count: number) =>
  Object.fromEntries(
    [...messageArguments(icu)].map(([name, kind]) => [
      name,
      kind === 'number' ? count : `«${name}»`,
    ]),
  );

const everyMessage = function* () {
  for (const table of tables)
    for (const key of keysOf(table))
      for (const locale of locales) yield { table, key, locale, icu: message(locale, table, key) };
};

describe('catalogs', () => {
  it('ship every table in English and Spanish with the same keys', () => {
    expect(locales).toEqual(['en', 'es']);
    expect(tables).toContain('app');
    for (const table of tables) {
      expect(keysOf(table).length, table).toBeGreaterThan(0);
      for (const key of keysOf(table)) {
        for (const locale of locales) expect(message(locale, table, key), key).toBeTypeOf('string');
      }
    }
  });

  it('format every message like the reference ICU implementation', () => {
    let checked = 0;
    for (const { table, key, locale, icu = '' } of everyMessage()) {
      for (const count of [1, 3]) {
        const values = samples(icu, count);
        const expected = new IntlMessageFormat(icu, locale, undefined, { ignoreTag: true });
        const ours = translate(locale, table, key, values);
        expect(ours, `${table} ${locale} ${key}`).toBe(String(expected.format(values)));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(5000);
  });

  it('keep every argument in Spanish: same names, same kinds, as the Swift key', () => {
    for (const table of tables) {
      for (const key of keysOf(table)) {
        const en = Object.fromEntries(messageArguments(message('en', table, key) ?? ''));
        const es = Object.fromEntries(messageArguments(message('es', table, key) ?? ''));
        expect(es, `${table} ${key}`).toEqual(en);
        const fromKey = Object.fromEntries(
          specifiersOf(key).map(({ index, kind }: { index: number; kind: string }) => [
            index,
            kind,
          ]),
        );
        for (const name of key.matchAll(/\$\{(\w+)\}/g)) fromKey[name[1] ?? ''] = 'string';
        expect(en, `${table} ${key}`).toEqual(fromKey);
      }
    }
  });
});

// Ported from the Swift app's SpanishLocalizationTests: which keys are translated, not wording.
describe('Spanish localization (Swift parity)', () => {
  const es = (key: string, table: Table = 'app') => translate('es', table, key, []);
  const en = (key: string, table: Table = 'app') => translate('en', table, key, []);
  const isTranslated = (key: string, table: Table = 'app') =>
    message('es', table, key) !== undefined &&
    es(key, table) !== en(key, table) &&
    es(key, table) !== '';

  it.each([
    'Appearance',
    'Hosts and Network',
    'Settings',
    'Notifications',
    'Home',
    'Sessions',
    'Cancel',
    'Retry',
    'Needs you',
    'Authentication failed',
    'Overlay network “%@” needs sign-in',
    'Waiting at least %@',
    'At least %@ ago',
    'Close Pane?',
    'Close Workspace',
    '%lld working',
    'Reasoning',
    'Unnamed subagent',
    'Token Usage',
    'Not read yet',
    'Git Not Found',
    'Folder is not empty. Delete its contents on the Host.',
    'Uploading Image… %lld%%',
    'Backspace',
    'Network secret',
    'Security',
    'Agentico Is Locked',
    'Unlock with %@',
    'After 5 Minutes',
    'Already answered.',
    'May be out of date',
    'Approves the prompt a Blocked Agent waits on.',
    'Blocked — waiting for input',
    'Connect to the Host to preview this image.',
    'The image changed while loading. Try again.',
    'Compaction failed',
    'Switched to %@',
    "OpenCode is working. Send once it's idle, or steer from the terminal.",
    'Branch names cannot end with ".".',
    'Unchanged, line %@',
    '. No newline at end of file.',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: an App Intents key, not a template
    'Open ${agent}',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: an App Intents key, not a template
    'Open ${host}',
  ])('translates %s', (key) => {
    expect(isTranslated(key)).toBe(true);
  });

  it('translates the usage descriptions', () => {
    for (const key of [
      'NSCameraUsageDescription',
      'NSLocalNetworkUsageDescription',
      'NSMicrophoneUsageDescription',
    ])
      expect(isTranslated(key, 'infoPlist'), key).toBe(true);
  });

  it('keeps product names in English', () => {
    expect(message('es', 'app', 'Agent %@')).toBe(message('en', 'app', 'Agent %@'));
    expect(es('Live Activity')).toBe(en('Live Activity'));
  });

  it('keeps format-only and command keys untranslated', () => {
    for (const key of ['--model "gpt 5" --continue', '$custom_name']) expect(es(key)).toBe(key);
  });

  it('ships Spanish in the extension tables', () => {
    for (const table of ['widgets', 'notificationService'] as const)
      expect(isTranslated('Done', table), table).toBe(true);
  });

  it('agrees nouns with the count in both languages', () => {
    for (const locale of locales) {
      for (const key of ['%lld Agents', '%lld terminals', '%lld days']) {
        const one = translate(locale, 'app', key, [1]);
        const three = translate(locale, 'app', key, [3]);
        expect(one, `${locale} ${key}`).toContain('1');
        expect(three.replace('3', '1'), `${locale} ${key}`).not.toBe(one);
      }
    }
    const blocked = (n: number) => translate('es', 'app', '%lld blocked', [n]);
    expect(blocked(2).replace('2', '1')).not.toBe(blocked(1));
  });
});
