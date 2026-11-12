// What changed, for verify-fast: the files that differ from a base commit, and the test files that
// read a changed data file (a golden, a fixture, a test vector) from disk, which no import graph shows.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const list = (out) => out.split('\0').filter(Boolean);

export const CODE = /\.(tsx?|jsx?|mjs|cjs)$/;

/**
 * Files that differ between `since` and the working tree, untracked files included. With no base
 * that is HEAD; with a base it is the merge base of the base and HEAD, so `--base main` checks the
 * whole branch and `--base <commit>` everything since that commit. Renames list both paths.
 */
export function changedFiles(base) {
  const since = base ? git('merge-base', base, 'HEAD').trim() : 'HEAD';
  const files = new Set([
    ...list(git('diff', '--name-only', '--no-renames', '-z', since)),
    ...list(git('ls-files', '--others', '--exclude-standard', '-z')),
  ]);
  return { since, files: [...files].sort() };
}

// Source that reads files from disk: a test, a testkit or a test-only helper. App code cannot
// import node:fs, so in these packages it only shows up in test code.
const READS_FILES = /from ['"](node:)?fs(\/promises)?['"]|require\(['"](node:)?fs['"]\)/;
const PACKAGE_ROOT = /^((?:packages|apps|modules)\/[^/]+)\//;

let readers;
function fileReaders(roots) {
  if (readers) return readers;
  readers = list(git('ls-files', '-z', ...roots))
    .filter((file) => CODE.test(file) && existsSync(file))
    .map((file) => ({ file, text: readFileSync(file, 'utf8') }))
    .filter(({ text }) => READS_FILES.test(text));
  return readers;
}

/**
 * The names a test would spell to reach a data file: the folders between its package root and the
 * file (src left out) and the file's stem. `packages/core/goldens/grok/screens/plan.ansi` gives
 * goldens, grok, screens, plan; tests build those paths from parts, so any one part counts.
 */
export function pathTokens(file) {
  const inside = file.replace(PACKAGE_ROOT, '');
  const parts = inside.split('/');
  const stem = parts.pop().replace(/\..*$/, '');
  return [...parts.filter((part) => part !== 'src'), stem].filter((token) => token.length >= 4);
}

/**
 * Code files under `roots` that read files from disk and name a changed data file by one of its
 * path tokens. Given to `vitest related` or `jest --findRelatedTests`, a test runs itself and a
 * testkit runs the tests that import it. Over-selects on purpose: a missed golden is the hole.
 */
export function readersOf(dataFiles, roots) {
  if (!dataFiles.length) return [];
  const tokens = [...new Set(dataFiles.flatMap(pathTokens))];
  return fileReaders(roots)
    .filter(({ text }) => tokens.some((token) => text.includes(token)))
    .map(({ file }) => file);
}

/** A changed file that is data a test may read: not code, not docs, not package metadata. */
export const isData = (file) =>
  !CODE.test(file) &&
  !/\.(md|d\.mts)$/.test(file) &&
  !/(^|\/)(package\.json|tsconfig[^/]*\.json|LICENSE|NOTICE)$/.test(file);
