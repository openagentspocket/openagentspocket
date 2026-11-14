import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { gitProblems, headCommit } from './git-state.mjs';

let dir;
let repo;
const git = (cwd, ...args) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@example.com',
    },
  });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'git-state-'));
  const remote = join(dir, 'remote.git');
  repo = join(dir, 'repo');
  git(dir, 'init', '-q', '--bare', '-b', 'main', remote);
  git(dir, 'init', '-q', '-b', 'main', repo);
  writeFileSync(join(repo, 'a.txt'), 'a\n');
  git(repo, 'add', '.');
  git(repo, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'a');
  git(repo, 'remote', 'add', 'origin', remote);
  git(repo, 'push', '-q', 'origin', 'main');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('a clean main level with origin/main may ship', () => {
  assert.deepEqual(gitProblems({ root: repo }), []);
  assert.match(headCommit(repo), /^[0-9a-f]{40}$/);
});

test('a dirty tree is refused, untracked files included', () => {
  writeFileSync(join(repo, 'b.txt'), 'b\n');
  assert.deepEqual(gitProblems({ root: repo }), ['the working tree has uncommitted changes']);
});

test('another branch is refused unless allowed', () => {
  git(repo, 'checkout', '-q', '-b', 'work');
  assert.match(
    gitProblems({ root: repo, branchHint: '(hint)' })[0],
    /on branch work, not main \(hint\)/,
  );
  assert.deepEqual(gitProblems({ root: repo, allowBranch: true }), []);
});

test('main ahead of origin/main is refused', () => {
  writeFileSync(join(repo, 'a.txt'), 'changed\n');
  git(repo, '-c', 'commit.gpgsign=false', 'commit', '-q', '-am', 'b');
  assert.match(gitProblems({ root: repo })[0], /not level with origin\/main/);
});
