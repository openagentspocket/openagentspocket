// What a release or an update publish requires of the checkout: on main, nothing uncommitted, and
// main level with origin/main, so what ships is exactly a commit everyone can see. Shared by
// scripts/release-ios.mjs and scripts/publish-update.mjs.
import { spawnSync } from 'node:child_process';

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return { ok: result.status === 0, out: (result.stdout ?? '').trim() };
}

/**
 * The reasons the checkout at `root` may not ship, empty when it may.
 *
 * @param {{root: string, allowBranch?: boolean, branchHint?: string}} options allowBranch lets
 *   another branch through (release-ios --allow-branch); the level check then does not apply.
 *   branchHint is appended to the branch problem, e.g. "(--allow-branch to override)".
 * @returns {string[]}
 */
export function gitProblems({ root, allowBranch = false, branchHint = '' }) {
  const problems = [];
  const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).out;
  if (branch !== 'main' && !allowBranch)
    problems.push(`on branch ${branch || '(none)'}, not main${branchHint ? ` ${branchHint}` : ''}`);
  if (git(root, ['status', '--porcelain']).out)
    problems.push('the working tree has uncommitted changes');
  if (branch === 'main') {
    const upstream = git(root, ['rev-parse', '--verify', '--quiet', 'origin/main']).out;
    const head = git(root, ['rev-parse', 'HEAD']).out;
    if (upstream !== head)
      problems.push('main is not level with origin/main (git fetch, then pull or push)');
  }
  return problems;
}

/** The commit HEAD points at. */
export function headCommit(root) {
  return git(root, ['rev-parse', 'HEAD']).out;
}
