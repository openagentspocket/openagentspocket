// The green stamp: verify-fast records the exact tree it checked, and the pre-commit hook skips its
// own run only when the tree being committed is that tree, on the same HEAD.
//   node scripts/verify/stamp.mjs --matches-staged   exit 0 when the staged tree was checked green
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const git = (args, env) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();

// Per worktree: `git rev-parse --git-path` resolves inside this worktree's own git directory.
const stampPath = () => git(['rev-parse', '--git-path', 'verify-fast-green']);
const head = () => git(['rev-parse', 'HEAD']);

/**
 * The tree of every file on disk that git would track (ignored files left out), as `git add -A`
 * would stage it, written through a scratch index so the real one is untouched.
 */
export function workingTree() {
  const index = git(['rev-parse', '--git-path', 'verify-fast-index']);
  const real = process.env.GIT_INDEX_FILE ?? git(['rev-parse', '--git-path', 'index']);
  if (existsSync(real)) copyFileSync(real, index);
  try {
    git(['add', '-A'], { GIT_INDEX_FILE: index });
    return git(['write-tree'], { GIT_INDEX_FILE: index });
  } finally {
    rmSync(index, { force: true });
  }
}

/** Forget any earlier green: called before a run, so a failed or interrupted one leaves none. */
export const clearStamp = () => rmSync(stampPath(), { force: true });

/** Record `tree` on the current HEAD as checked green. */
export const writeStamp = (tree) => writeFileSync(stampPath(), `${head()} ${tree}\n`);

/** True when the tree the commit will record (the index, as git hands it to the hook) is stamped. */
export function stagedTreeMatches() {
  const path = stampPath();
  if (!existsSync(path)) return false;
  const [stampedHead, stampedTree] = readFileSync(path, 'utf8').trim().split(' ');
  try {
    return stampedHead === head() && stampedTree === git(['write-tree']);
  } catch {
    return false; // no HEAD yet, or an index with conflicts: no tree to compare
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--matches-staged'))
  process.exit(stagedTreeMatches() ? 0 : 1);
