import { describe, expect, it } from 'vitest';
import {
  type AddAccountOptions,
  addAccount,
  ClaudeAccountError,
  decodeAccountFile,
  emptyAccountFile,
  encodeAccountFile,
  ignoreDirectory,
  isValidAccountId,
  removeAccount,
  renameAccount,
  type UsageAccountFile,
} from './account-file';

const DEFAULT_ID = 'default';

function add(file: UsageAccountFile, directory: string, rest: Partial<AddAccountOptions> = {}) {
  return addAccount(file, { directory, defaultDirectory: null, ...rest });
}

function reason(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof ClaudeAccountError) return error.reason.kind;
    throw error;
  }
  return 'none';
}

describe('decodeAccountFile', () => {
  it('reads a file the plugin accepts', () => {
    const file = decodeAccountFile(
      JSON.stringify({
        version: 1,
        claude: {
          defaultName: 'Main',
          accounts: [{ id: '7f3c9a2e', directory: '/Users/u/.claude-2', name: 'work' }],
          ignored: ['/Users/u/.claude-old'],
        },
      }),
    );
    expect(file.defaultName).toBe('Main');
    expect(file.accounts.map((a) => a.name)).toEqual(['work']);
    expect(file.ignored).toEqual(['/Users/u/.claude-old']);
  });

  it.each([null, 'not json', '[1]', '{"claude": {"accounts": []}}', '{"version": "1"}'])(
    'reads %j as empty',
    (text) => {
      expect(decodeAccountFile(text)).toEqual(emptyAccountFile());
    },
  );

  it('refuses to rewrite another version', () => {
    expect(reason(() => decodeAccountFile('{"version": 2}'))).toBe('unsupportedFileVersion');
  });

  it('drops the entries the plugin would skip', () => {
    const entry = (id: string, directory: string, name: string) => ({ id, directory, name });
    const file = decodeAccountFile(
      JSON.stringify({
        version: 1,
        claude: {
          defaultName: 'Main',
          accounts: [
            entry('7f3c9a2e', '/a', 'one'),
            entry('7f3c9a2e', '/b', 'dup id'),
            entry('short', '/c', 'bad id'),
            entry('default', '/d', 'reserved'),
            entry('aaaaaaaa', 'relative', 'relative'),
            entry('bbbbbbbb', '/e', '  '),
            entry('cccccccc', '/f', 'one'),
            entry('dddddddd', '/g', 'Main'),
            entry('eeeeeeee', '/h', 'kept'),
          ],
          ignored: ['/x', 'rel', 3],
        },
      }),
    );
    expect(file.accounts.map((a) => a.name)).toEqual(['one', 'kept']);
    expect(file.ignored).toEqual(['/x']);
  });

  it('carries fields it does not know through a rewrite, with sorted keys', () => {
    const text = JSON.stringify({
      version: 1,
      future: { a: 1 },
      claude: {
        extra: true,
        accounts: [{ id: '7f3c9a2e', directory: '/a', name: 'one', color: 'red' }],
      },
    });
    const out = JSON.parse(encodeAccountFile(decodeAccountFile(text)));
    expect(out.future).toEqual({ a: 1 });
    expect(out.claude.extra).toBe(true);
    expect(out.claude.accounts[0].color).toBe('red');
    expect(out.claude.defaultName).toBeNull();
    expect(Object.keys(out)).toEqual(['claude', 'future', 'version']);
  });
});

describe('addAccount', () => {
  it('names an Account for its directory and gives it an id the plugin accepts', () => {
    let { file, account } = add(emptyAccountFile(), '/Users/u/.claude-2', {
      defaultDirectory: '/Users/u/.claude',
    });
    expect(account.name).toBe('claude-2');
    expect(isValidAccountId(account.id)).toBe(true);
    expect(account.id).toHaveLength(8);
    // A taken name gets a number; "Default" is the Default Account's.
    ({ file, account } = add(file, '/Volumes/T7/.claude-2'));
    expect(account.name).toBe('claude-2 2');
    ({ file, account } = add(file, '/srv/..Default'));
    expect(account.name).toBe('Default 2');
    expect(file.accounts).toHaveLength(3);
    expect(decodeAccountFile(encodeAccountFile(file))).toEqual(file);
  });

  it('keeps a suggestion its name and takes it off the ignored list', () => {
    let file = ignoreDirectory(emptyAccountFile(), '/Users/u/.claude-work', null);
    ({ file } = add(file, '/Users/u/.claude-work/', { name: 'claude-work' }));
    expect(file.accounts[0]?.name).toBe('claude-work');
    expect(file.ignored).toEqual([]);
  });

  it('never repeats an id', () => {
    const values = [7, 7, 7, 9].map((n) => n / 2 ** 32);
    const random = () => values.shift() ?? 0.5;
    let { file } = add(emptyAccountFile(), '/a/.claude-1', { random });
    ({ file } = add(file, '/a/.claude-2', { random }));
    const ids = file.accounts.map((a) => a.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids.every(isValidAccountId)).toBe(true);
  });

  it('refuses what cannot count: relative, listed, default, a fifth', () => {
    const { file } = add(emptyAccountFile(), '/Users/u/.claude-2');
    expect(reason(() => add(file, 'Users/u/.claude-3'))).toBe('notAbsolute');
    expect(reason(() => add(file, '/Users/u/.claude-2'))).toBe('alreadyListed');
    expect(reason(() => add(file, '/Users/u/.claude-2/'))).toBe('alreadyListed');
    expect(
      reason(() => add(file, '/Users/u/.claude', { defaultDirectory: '/Users/u/.claude' })),
    ).toBe('alreadyListed');
    const full = add(add(file, '/c3').file, '/c4').file;
    expect(reason(() => add(full, '/c5'))).toBe('limitReached');
    // Dismissing a suggestion stays possible at the limit.
    expect(ignoreDirectory(full, '/c5', null).ignored).toEqual(['/c5']);
  });
});

describe('renameAccount', () => {
  it('keeps names unique across the Host, the Default Account included', () => {
    let { file, account: added } = add(emptyAccountFile(), '/Users/u/.claude-2');
    let other: typeof added;
    ({ file, account: other } = add(file, '/Users/u/.claude-3'));
    file = renameAccount(file, DEFAULT_ID, '  Personal ');
    expect(file.defaultName).toBe('Personal');
    expect(reason(() => renameAccount(file, DEFAULT_ID, 'claude-2'))).toBe('nameTaken');
    expect(reason(() => renameAccount(file, added.id, 'Personal'))).toBe('nameTaken');
    expect(reason(() => renameAccount(file, added.id, 'claude-3'))).toBe('nameTaken');
    expect(reason(() => renameAccount(file, added.id, ' '))).toBe('emptyName');
    expect(reason(() => renameAccount(file, 'zzzzzzzz', 'Max'))).toBe('accountNotFound');
    file = renameAccount(file, added.id, 'claude-2');
    file = renameAccount(file, added.id, 'Max');
    // An empty name gives the Default Account back its own label, which no Account can then take.
    file = renameAccount(file, DEFAULT_ID, '');
    expect(file.defaultName).toBeNull();
    expect(reason(() => renameAccount(file, other.id, 'Default'))).toBe('nameTaken');
    expect(file.accounts.map((a) => a.name)).toEqual(['Max', 'claude-3']);
  });
});

describe('removeAccount and ignoreDirectory', () => {
  it('remembers a removed directory and forgets it when added back', () => {
    let { file, account } = add(emptyAccountFile(), '/Users/u/.claude-2');
    expect(removeAccount(file, 'zzzzzzzz')).toBe(file);
    file = removeAccount(file, account.id);
    expect(file.accounts).toEqual([]);
    expect(file.ignored).toEqual(['/Users/u/.claude-2']);
    ({ file } = add(file, '/Users/u/.claude-2/'));
    expect(file.ignored).toEqual([]);
    file = ignoreDirectory(file, '/Users/u/.claude-backup', null);
    file = ignoreDirectory(file, '/Users/u/.claude-backup/', null);
    expect(file.ignored).toEqual(['/Users/u/.claude-backup']);
    expect(reason(() => ignoreDirectory(file, '~/.claude-x', null))).toBe('notAbsolute');
  });

  it('changes nothing when the directory already counts', () => {
    const { file } = add(emptyAccountFile(), '/Users/u/.claude-2');
    expect(ignoreDirectory(file, '/Users/u/.claude-2/', '/Users/u/.claude')).toBe(file);
    expect(ignoreDirectory(file, '/Users/u/.claude', '/Users/u/.claude/')).toBe(file);
  });
});

describe('isValidAccountId', () => {
  it.each([
    ['7f3c9a2e', true],
    ['A-b_C-d_E', true],
    ['a'.repeat(32), true],
    ['7f3c9a2', false],
    ['a'.repeat(33), false],
    ['default', false],
    ['constructor', false],
    ['hasOwnProperty', false],
    ['toString', false],
    ['__proto__', false],
    ['valueOf1', true],
    ['7f3c 9a2e', false],
    ['7f3c9a2é', false],
  ])('%s -> %s', (id, valid) => {
    expect(isValidAccountId(id)).toBe(valid);
  });
});
