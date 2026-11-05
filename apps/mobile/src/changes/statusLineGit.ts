import type { GitStatus } from '@openagentspocket/core';
import type { StatusLineProps } from '@openagentspocket/ui';

/** The status line's git props (branch, counters, diff) from a git status; nothing while unread. */
export function statusLineGit(
  git: GitStatus | null,
): Pick<StatusLineProps, 'branch' | 'counts' | 'diff'> {
  if (!git) return {};
  return {
    branch: git.branch ?? undefined,
    counts: {
      behind: git.behind,
      ahead: git.ahead,
      conflicts: git.conflicts,
      staged: git.staged,
      changed: git.changed,
      untracked: git.untracked,
    },
    diff: git.diff,
  };
}
