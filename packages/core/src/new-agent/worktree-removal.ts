import type { RepositoryCheckout } from '../console/row';
import { HerdrApiError } from '../errors/herdr-api-error';
import { userFacingDescription } from '../errors/presentation';
import { type Joined, type Message, message, type Text } from '../errors/text';
import { TransportFailure } from '../errors/transport-error';
import { readsAsHerdrGlobalOption, renderHerdrCommand } from '../hosts/herdr-command-line';
import type { HerdrEndpoint } from '../hosts/herdr-endpoint';

/**
 * Exact linked-worktree identity shown to the user. The workspace id alone cannot authorize a
 * destructive request, because herdr may reuse it.
 */
export interface WorktreeIdentity {
  readonly hostId: string;
  readonly workspaceId: string;
  readonly repoKey: string;
  readonly checkoutPath: string;
}

export function worktreeIdentity(
  hostId: string,
  workspaceId: string,
  checkout: RepositoryCheckout,
): WorktreeIdentity {
  return { hostId, workspaceId, repoKey: checkout.repoKey, checkoutPath: checkout.checkoutPath };
}

/** Whether a snapshot checkout is still the linked worktree the identity names. */
export function identityMatches(identity: WorktreeIdentity, checkout: RepositoryCheckout): boolean {
  return (
    checkout.isLinkedWorktree &&
    checkout.repoKey === identity.repoKey &&
    checkout.checkoutPath === identity.checkoutPath
  );
}

/** Immutable request carried from confirmation to the transport; `id` keeps operations distinct. */
export interface WorktreeRemovalRequest {
  readonly id: string;
  readonly identity: WorktreeIdentity;
}

let nextRequestNumber = 0;

export function worktreeRemovalRequest(identity: WorktreeIdentity): WorktreeRemovalRequest {
  nextRequestNumber += 1;
  return { id: `removal-${nextRequestNumber}`, identity };
}

/** The affected Agent keys are captured from the validated snapshot, never matched by id alone. */
export interface WorktreeRemovalReceipt {
  readonly request: WorktreeRemovalRequest;
  readonly affectedAgentKeys: ReadonlySet<string>;
}

export type WorktreeRemovalFailure = 'staleIdentity' | 'alreadyInProgress' | 'outcomeUnconfirmed';

/** Thrown by the removal port; the other failures are the transport's or herdr's own. */
export class WorktreeRemovalError extends Error {
  override readonly name = 'WorktreeRemovalError';

  constructor(readonly reason: WorktreeRemovalFailure) {
    super(`WorktreeRemovalError.${reason}`);
  }
}

const REMOVAL_MESSAGES: Readonly<Record<WorktreeRemovalFailure, Message>> = {
  staleIdentity: message('This is no longer the same linked worktree. Nothing was removed.'),
  alreadyInProgress: message('This worktree already has a removal in progress.'),
  outcomeUnconfirmed: message(
    'The Host did not confirm whether removal completed. Close this sheet, wait for the Console to refresh, then reopen Worktree Details.',
  ),
};

export const removalErrorMessage = (reason: WorktreeRemovalFailure): Message =>
  REMOVAL_MESSAGES[reason];

export type ConfirmationBranch =
  | { readonly kind: 'named'; readonly name: string }
  | { readonly kind: 'detached' }
  | { readonly kind: 'unavailable' };

export interface WorktreeRemovalConfirmation {
  readonly request: WorktreeRemovalRequest;
  readonly title: Message;
  readonly message: Joined;
}

const joined = (parts: Text[]): Joined => ({ join: parts, separator: ' ' });

/** What the confirmation says: the blast radius, the branch that is kept, a working Agent. */
export function worktreeRemovalConfirmation(input: {
  request: WorktreeRemovalRequest;
  workspaceLabel: string;
  branch: ConfirmationBranch;
  hasWorkingAgent: boolean;
}): WorktreeRemovalConfirmation {
  const { request, branch } = input;
  const sentences: Text[] = [
    message(
      'This deletes %@ and closes the whole workspace, ending every Agent and closing every Pane in it.',
      request.identity.checkoutPath,
    ),
  ];
  if (branch.kind === 'named') sentences.push(message('The local branch %@ is kept.', branch.name));
  if (branch.kind === 'unavailable') sentences.push(message('Any local branch is kept.'));
  if (input.hasWorkingAgent) {
    sentences.push(message('An Agent is still working in this worktree.'));
  }
  sentences.push(message("This can't be undone."));
  return {
    request,
    title: message('Remove %@ worktree?', input.workspaceLabel),
    message: joined(sentences),
  };
}

/** How Worktree Details explains a removal that failed. */
export interface WorktreeRemovalRefusal {
  readonly message: Text;
  /** The worktree may hold uncommitted work, so the alert offers Changes. */
  readonly offersChanges: boolean;
  /** The herdr command that forces the removal, for the user to run on the Host. */
  readonly command?: string;
}

const FORCE_REQUIRED_CODE = 'dirty_worktree_requires_force';
/** git's refusal for a worktree with checked-out submodules; herdr finds it ignoring case. */
const SUBMODULES_REFUSAL = 'working trees containing submodules cannot be moved or removed';

function refusalForCode(
  code: string,
  serverMessage: string,
  request: WorktreeRemovalRequest,
  session: string,
  endpoint: HerdrEndpoint | null,
): WorktreeRemovalRefusal {
  const { workspaceId, checkoutPath } = request.identity;
  if (code === FORCE_REQUIRED_CODE) {
    if (serverMessage.toLowerCase().includes(SUBMODULES_REFUSAL)) {
      const warning = message(
        "herdr couldn't remove this worktree because it has checked-out submodules. Forcing the removal deletes %@ and any uncommitted changes in it, so check its Changes first.",
        checkoutPath,
      );
      // herdr would take such an id as its own option, so no command can hand it over.
      if (readsAsHerdrGlobalOption(workspaceId)) return { message: warning, offersChanges: true };
      const command = renderHerdrCommand(session, endpoint, [
        'worktree',
        'remove',
        '--workspace',
        workspaceId,
        '--force',
      ]);
      return {
        message: message('%@ To force it, run on the Host: %@', warning, command),
        offersChanges: true,
        command,
      };
    }
    return {
      message: message(
        "herdr couldn't remove this worktree because it has modified or untracked files. Commit or discard those changes on the Host, then retry.",
      ),
      offersChanges: true,
    };
  }
  if (code === 'not_linked_worktree') {
    return {
      message: message(
        "herdr couldn't remove this worktree because the workspace is not a linked worktree.",
      ),
      offersChanges: false,
    };
  }
  if (code === 'workspace_not_found') {
    return {
      message: message(
        "herdr couldn't remove this worktree because the workspace is no longer on the Host.",
      ),
      offersChanges: false,
    };
  }
  return {
    message: message("herdr couldn't remove this worktree: %@", serverMessage),
    offersChanges: false,
  };
}

/** The endpoint overrides the Host's session, as it does for API requests. */
export function worktreeRemovalRefusal(
  error: unknown,
  request: WorktreeRemovalRequest,
  session: string,
  endpoint: HerdrEndpoint | null = null,
): WorktreeRemovalRefusal {
  const plain = (text: Message): WorktreeRemovalRefusal => ({
    message: text,
    offersChanges: false,
  });
  if (error instanceof WorktreeRemovalError) return plain(removalErrorMessage(error.reason));
  if (error instanceof HerdrApiError) {
    return refusalForCode(error.code, error.message, request, session, endpoint);
  }
  if (error instanceof TransportFailure) {
    const failure = error.error;
    switch (failure.kind) {
      case 'apiRejected':
        return refusalForCode(failure.code, failure.message, request, session, endpoint);
      case 'sshUnreachable':
        return plain(message('The Host is not connected.'));
      case 'timedOut':
        return plain(message('The Host did not answer in time.'));
      case 'cancelled':
        return plain(message('Worktree removal was cancelled.'));
    }
  }
  return plain(message('Removing the worktree failed: %@', userFacingDescription(error)));
}
