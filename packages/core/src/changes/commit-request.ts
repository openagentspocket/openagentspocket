import { message, type Text } from '../errors/text';
import { isClean } from './presentation';
import type { CheckoutChanges } from './types';

/**
 * What Changes can ask an Agent to do with its Checkout. The app never runs git: it hands a
 * plain-language request to the Agent's Composer and the user sends it. No slash commands and no
 * per-program wording, so every program understands it.
 */
export type CommitRequestKind = 'commit' | 'pullRequest';

/** Commits on this branch that its remote may not have: ahead of upstream, or never pushed. */
function hasUnpushedWork(changes: CheckoutChanges): boolean {
  const { head } = changes;
  if (head.isUnborn || head.branch.kind !== 'named') return false;
  if (head.upstream === null) return true;
  return head.upstream.state.kind === 'tracking' && head.upstream.state.ahead > 0;
}

/**
 * The requests worth offering: both while there is something to commit; on a clean Checkout only
 * the pull request, and only while the branch has commits its remote may lack.
 */
export function commitRequestKinds(changes: CheckoutChanges): readonly CommitRequestKind[] {
  if (!isClean(changes)) return ['commit', 'pullRequest'];
  return hasUnpushedWork(changes) ? ['pullRequest'] : [];
}

function countText(changes: CheckoutChanges): Text {
  const count = changes.totals.trackedFiles + changes.totals.untrackedItems;
  return message(count === 1 ? '%@ file changed' : '%@ files changed', String(count));
}

function contextText(changes: CheckoutChanges): Text {
  const { branch } = changes.head;
  if (isClean(changes)) {
    return branch.kind === 'named'
      ? message('Please open a pull request for the commits on branch %@.', branch.name)
      : message('Please open a pull request for the commits on this detached HEAD.');
  }
  return branch.kind === 'named'
    ? message(
        'Please look at the uncommitted changes in this repository (%@, branch %@).',
        countText(changes),
        branch.name,
      )
    : message(
        'Please look at the uncommitted changes in this repository (%@, detached HEAD).',
        countText(changes),
      );
}

const hasConflicts = (changes: CheckoutChanges) =>
  changes.files.some((file) => file.kind === 'conflicted');

/** The request, unresolved: the app renders it through its catalog like every Changes string. */
export function commitRequestText(changes: CheckoutChanges, kind: CommitRequestKind): Text {
  const clean = isClean(changes);
  const parts: Text[] = [contextText(changes)];
  if (hasConflicts(changes)) {
    parts.push(message('Some files have merge conflicts: stop and tell me instead of committing.'));
  }
  if (kind === 'pullRequest') {
    parts.push(
      message(
        "If this is the repository's default branch or a detached HEAD, create a new branch with a descriptive name first.",
      ),
    );
  }
  if (!clean) {
    parts.push(message('Commit the changes with a clear message that says what changed and why.'));
  }
  if (kind === 'pullRequest') {
    parts.push(
      message(
        'Push the branch, open a pull request with a short summary, and reply with its link.',
      ),
    );
  }
  parts.push(message('Never force-push or rewrite history.'));
  return { join: parts, separator: ' ' };
}
