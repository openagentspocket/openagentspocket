import { describe, expect, it } from 'vitest';
import { encodeText } from './bytes';
import {
  Cap,
  changesScript,
  makeNonce,
  NEUTRALIZING_OPTIONS,
  PATH_EXPORT,
  patchScript,
  SHELL_INVOCATION,
  singleQuoted,
  untrackedDirectoryScript,
} from './script';
import type { FilePatchRequest } from './types';

const HOSTILE = [
  '--',
  '-dash.txt',
  'sp ace.txt',
  'quo"te.txt',
  "sq'uote.txt",
  'two\\\\bs.txt',
  'trail\\',
  'bang!.txt',
  '$HOME.txt',
  '*.txt',
  '[ab].txt',
  'ünï.txt',
  '中文.txt',
  'line\nbreak.txt',
  'tab\tname.txt',
  "''",
  '$(touch pwned)',
  '`id`',
  '; rm -rf ~ #',
  "a'\\''b",
];

/** Reads one POSIX shell word made only of single-quoted runs; returns its value and end. */
function parseQuotedWord(text: string, from: number): { value: string; end: number } | null {
  let index = from;
  let value = '';
  while (index < text.length && text[index] === "'") {
    const close = text.indexOf("'", index + 1);
    if (close < 0) return null;
    value += text.slice(index + 1, close);
    index = close + 1;
    // `'\''` joins two quoted runs with an escaped quote.
    if (text.startsWith("\\''", index)) {
      value += "'";
      index += 2;
    }
  }
  return index === from ? null : { value, end: index };
}

const script = (directory: string) => changesScript(directory, 'F00D');

describe('script shape', () => {
  it('travels to one fixed shell invocation, as one brace group on the null device', () => {
    expect(SHELL_INVOCATION).toBe('/bin/sh -s');
    const text = script('/home/dev/app');
    expect(text.startsWith('{\n')).toBe(true);
    expect(text.endsWith('\n} </dev/null 3>&1\n')).toBe(true);
    expect(text).toContain('\nprintf \'\\n%s done\\n\' "$N"\n');
    expect(text).toContain("N='__AGENTICO_GIT_F00D__'\n");
  });

  it.each(HOSTILE)('a hostile directory (%j) appears only inside single quotes', (name) => {
    const directory = `/home/dev/src/${name}`;
    const text = script(directory);
    const assignment = text.indexOf('\ndir=') + 5;
    const word = parseQuotedWord(text, assignment);
    expect(word?.value).toBe(encodeText(directory));
    const rest = text.slice(0, assignment) + text.slice(word?.end ?? 0);
    expect(rest).not.toContain('/home/dev/src/');
    // The variable is only ever expanded inside double quotes.
    for (const match of text.matchAll(/\$dir/g)) {
      expect(text[match.index - 1]).toBe('"');
      expect(text[match.index + 4]).toBe('"');
    }
  });

  it('single quoting keeps every byte', () => {
    expect(singleQuoted("a'b\n\t\\\u0080\u00ff'")).toBe("'a'\\''b\n\t\\\u0080\u00ff'\\'''");
  });

  it('neutralizes every command but the version probe', () => {
    const text = script('/home/dev/app');
    const lines = text.split('\n');
    const definition = lines.find((line) => line.startsWith('g() { git ')) ?? '';
    const words = definition.split(' ');
    const hasOption = (key: string, value: string) =>
      words.some((word, index) => word === '-c' && words[index + 1] === `${key}=${value}`);
    // Empty, never `false`: git 2.35.1 and older run a program named false.
    expect(hasOption('core.fsmonitor', '')).toBe(true);
    expect(definition).not.toContain('core.fsmonitor=false');
    expect(hasOption('diff.autoRefreshIndex', 'false')).toBe(true);
    expect(hasOption('status.renames', 'true')).toBe(true);
    expect(hasOption('core.hooksPath', '/dev/null')).toBe(true);
    expect(hasOption('diff.suppressBlankEmpty', 'false')).toBe(true);
    for (const flag of ['--no-optional-locks', '--literal-pathspecs', '--no-pager']) {
      expect(words).toContain(flag);
    }
    expect(NEUTRALIZING_OPTIONS).toContain('core.quotePath=false');
    const direct = lines.filter((line) => /(^|[ ;({])git /.test(line));
    expect(direct).toEqual([definition, 'sec 4096 version git --version']);
    expect(text).toContain('unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE ');
    expect(text).toContain('LC_ALL=C ');
    expect(text).toContain('GIT_NO_LAZY_FETCH=1');
    expect(text).toContain(PATH_EXPORT);
  });

  it('reads status and counts from the top level under the documented caps', () => {
    const text = script('/home/dev/app');
    expect(text).toContain(
      `sec ${Cap.discover} discover g -C "$dir" rev-parse --show-toplevel --show-prefix --absolute-git-dir --git-common-dir`,
    );
    expect(text).toContain(
      `sec ${Cap.status} status g -C "$top" status --porcelain=v2 -z --branch --untracked-files=normal`,
    );
    expect(text).toContain(
      `sec ${Cap.numstat} numstat g -C "$top" diff "$b" --numstat -z --no-ext-diff --no-textconv --find-renames --submodule=short --`,
    );
    expect(text).toContain(`sec ${Cap.head} head latest "$top"`);
  });

  it('gives each request a fresh shell-safe nonce', () => {
    const first = makeNonce();
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(makeNonce()).not.toBe(first);
  });
});

describe('patch and directory scripts', () => {
  const request = (over: Partial<FilePatchRequest>): FilePatchRequest => ({
    topLevel: '/home/dev/app',
    path: 'a.txt',
    originalPath: null,
    isUntracked: false,
    limit: 'initial',
    ...over,
  });
  const text = (data: string) => data;

  it('tracked reads use HEAD and both rename paths', () => {
    const body = text(patchScript(request({ originalPath: 'old.txt', path: 'new.txt' }), 'F00D'));
    expect(body).toContain('b=$(base "$top")');
    expect(body).toContain(`sec ${Cap.patch} patch g -C "$top" diff "$b" --no-color`);
    expect(body).toContain("--find-renames --submodule=short -- 'new.txt' 'old.txt'\n");
  });

  it('untracked and extended reads use the empty file and the requested cap', () => {
    const body = text(patchScript(request({ isUntracked: true, limit: 'extended' }), 'F00D'));
    expect(body).not.toContain('base "$top"');
    expect(body).toContain(`sec ${Cap.patchExtended} patch`);
    expect(body).toContain('--no-index');
    expect(body).toContain("-U3 -- /dev/null 'a.txt'\n");
  });

  it.each(HOSTILE)('all three paths stay single-quoted (%j)', (name) => {
    const top = encodeText(`/home/dev/${name}`);
    const path = encodeText(name);
    const body = text(patchScript(request({ topLevel: top, path, originalPath: path }), 'F00D'));
    const topWord = parseQuotedWord(body, body.indexOf('top=') + 4);
    expect(topWord?.value).toBe(top);
    const startMarker = '--submodule=short -- ';
    const tail = body.slice(
      body.indexOf(startMarker) + startMarker.length,
      body.indexOf("\nprintf '\\n%s done"),
    );
    const first = parseQuotedWord(tail, 0);
    expect(first?.value).toBe(path);
    expect(parseQuotedWord(tail, (first?.end ?? 0) + 1)?.value).toBe(path);
  });

  it('raw path bytes are not decoded on the way to the Host', () => {
    const raw = '\u0080\u00ffname';
    expect(patchScript(request({ path: raw }), 'F00D')).toContain(`'${raw}'`);
  });

  it('lists an untracked directory from the top level under the status cap', () => {
    const body = untrackedDirectoryScript('/home/dev/app', 'newdir/', 'F00D');
    expect(body).toContain(
      `sec ${Cap.status} untracked g -C "$top" status --porcelain=v2 -z --untracked-files=all -- 'newdir/'`,
    );
  });
});
