import { FileBrowserError, type FileBrowserErrorKind, nameProblem } from '@openagentspocket/core';
import { catalogSources, keysOf, locales, message } from '@openagentspocket/i18n';

const KINDS: FileBrowserErrorKind[] = [
  'notFound',
  'permissionDenied',
  'alreadyExists',
  'directoryNotEmpty',
  'notAFile',
  'tooLarge',
  'protectedItem',
  'unusableName',
  'timedOut',
  'sftpUnavailable',
  'transferIncomplete',
  'localStorageFailed',
  'refused',
];

/** Catalog keys the file browser core puts in front of the user, outside any screen. */
const CORE_KEYS = [
  ...KINDS.map((kind) => new FileBrowserError(kind).text),
  nameProblem(''),
  nameProblem('..'),
  nameProblem('a/b'),
  nameProblem('a\u0000'),
  nameProblem('x'.repeat(300)),
]
  .flatMap((text) => (typeof text === 'object' && text !== null && 'key' in text ? [text.key] : []))
  .concat([
    'The link points to nothing.',
    'Another change is running. Upload again when it finishes.',
    'A link is never replaced by an upload.',
    'A folder cannot be replaced by a file.',
    'That file could not be read on this device.',
    'Something went wrong: %@',
    'The connection dropped before the Host answered, so the change may have happened. The folder shows what is there now.',
  ]);

describe('file browser messages', () => {
  it('reads every core message from the catalog, in every locale', () => {
    expect(catalogSources).toBeDefined();
    expect(CORE_KEYS.length).toBeGreaterThan(15);
    for (const key of CORE_KEYS) {
      expect(keysOf('app')).toContain(key);
      for (const locale of locales) expect(message(locale, 'app', key)).toBeTruthy();
    }
  });
});
