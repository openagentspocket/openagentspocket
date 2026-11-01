import { describe, expect, it } from 'vitest';
import vector from '../../../plugin/test-vectors/notification-session-v1.json';
import { readsAsHerdrGlobalOption, renderHerdrCommand, shellWord } from './herdr-command-line';
import { makeHerdrEndpoint } from './herdr-endpoint';

// Ports Tests/AgenticoTests/HerdrCommandLineTests.swift.

const ENABLE = ['plugin', 'enable', 'agentico'];
const removeWorkspace = (workspace: string) =>
  renderHerdrCommand('', null, ['worktree', 'remove', '--workspace', workspace, '--force']);

describe('herdr command line', () => {
  it('lets an endpoint override the session without shell expansion', () => {
    const endpoint = makeHerdrEndpoint(
      '/tmp/herdr test/$USER/herdr/herdr.sock',
      '/tmp/herdr test/launcher',
    );
    expect(endpoint).not.toBeNull();
    expect(
      renderHerdrCommand('other', endpoint, [
        'worktree',
        'remove',
        '--workspace',
        'w $(id)',
        '--force',
      ]),
    ).toBe(
      `/bin/sh -c 'export HERDR_SOCKET_PATH="$1"; shift; exec "$@"' herdr '/tmp/herdr test/$USER/herdr/herdr.sock' '/tmp/herdr test/launcher' worktree remove --workspace 'w $(id)' --force`,
    );
  });

  it('gives the default session the short form', () => {
    expect(renderHerdrCommand('', null, ENABLE)).toBe('herdr plugin enable agentico');
  });

  it('names a named session right after herdr', () => {
    expect(renderHerdrCommand('work', null, ENABLE)).toBe(
      'herdr --session work plugin enable agentico',
    );
  });

  it.each(vector.names.filter((entry) => entry.valid).map((entry) => entry.name))(
    'keeps the valid session name %j bare',
    (name) => {
      expect(renderHerdrCommand(name, null, ENABLE)).toBe(
        `herdr --session ${name} plugin enable agentico`,
      );
    },
  );

  it("keeps herdr's own ids bare", () => {
    expect(
      renderHerdrCommand('work', null, ['worktree', 'remove', '--workspace', 'w1C', '--force']),
    ).toBe('herdr --session work worktree remove --workspace w1C --force');
    expect(
      renderHerdrCommand('', null, ['pane', 'move', 'w1:p1', '--tab', 'w1:t2', '--split', 'right']),
    ).toBe('herdr pane move w1:p1 --tab w1:t2 --split right');
  });

  it.each([
    ['   ', 'herdr plugin enable agentico'],
    [' \t ', 'herdr plugin enable agentico'],
    [' work\t', 'herdr --session work plugin enable agentico'],
  ])('trims the session %j, so a blank one means the default session', (session, expected) => {
    expect(renderHerdrCommand(session, null, ENABLE)).toBe(expected);
  });

  it.each([
    ['w 1', "'w 1'"],
    ['', "''"],
    ['=w1', "'=w1'"],
    ['~w1', "'~w1'"],
    ['$HOME', "'$HOME'"],
    ['w1;w2', "'w1;w2'"],
    ['w*', "'w*'"],
    ['#w1', "'#w1'"],
    ['wé', "'wé'"],
  ])('single-quotes %j, outside the shell-safe set', (argument, quoted) => {
    expect(removeWorkspace(argument)).toBe(`herdr worktree remove --workspace ${quoted} --force`);
  });

  // fish reads \' and \\ inside single quotes as escapes, POSIX shells read
  // neither: both go outside the quotes. A combining mark cannot hide a quote.
  it.each([
    ["it's", String.raw`'it'\''s'`],
    [String.raw`a\b`, String.raw`'a'\\'b'`],
    ["'", String.raw`\'`],
    [String.raw`a\'b`, String.raw`'a'\\\''b'`],
    ["'́", `\\''́'`],
  ])('puts the quotes and backslashes of %j outside the quotes', (argument, quoted) => {
    expect(removeWorkspace(argument)).toBe(`herdr worktree remove --workspace ${quoted} --force`);
  });

  it('quotes an invalid session name like any other word', () => {
    expect(renderHerdrCommand('bad name', null, ENABLE)).toBe(
      "herdr --session 'bad name' plugin enable agentico",
    );
  });
});

describe('shellWord', () => {
  it.each(['w1', 'w1:p1', 'feature.v2_tmp-1', 'A-Z.0_9'])(
    'leaves the safe word %j bare',
    (word) => {
      expect(shellWord(word)).toBe(word);
    },
  );

  it('writes the empty word as two quotes', () => {
    expect(shellWord('')).toBe("''");
  });

  it('starts and ends outside the quotes when the word does', () => {
    expect(shellWord("'a'")).toBe(String.raw`\''a'\'`);
    expect(shellWord(String.raw`\\`)).toBe(String.raw`\\\\`);
  });
});

describe('herdr global options', () => {
  // herdr compares bytes, so a combining mark after the `=` hides nothing.
  it.each([
    '--session',
    '--session=other',
    '--session=',
    '--session=́other',
    '--remote',
    '--remote=other',
    '--remote-keybindings',
    '--remote-keybindings=server',
    '--handoff',
  ])('reads %j as its own option', (word) => {
    expect(readsAsHerdrGlobalOption(word)).toBe(true);
  });

  // --machine counts only before the subcommand, --handoff has no =value
  // form, and -- ends herdr's own options.
  it.each([
    '--sessions',
    '-session',
    '--session-x',
    'w1',
    '--workspace',
    '--remotes',
    '--handoff=yes',
    '--machine=other',
    '--',
  ])('passes %j to the subcommand', (word) => {
    expect(readsAsHerdrGlobalOption(word)).toBe(false);
  });
});
