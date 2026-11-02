import { Observable } from '../changes/observable';
import type { RepositoryCheckout } from '../console/row';
import type { Text } from '../errors/text';
import { TransportFailure } from '../errors/transport-error';
import type { HerdrEndpoint } from '../hosts/herdr-endpoint';
import {
  type ConfirmationBranch,
  removalErrorMessage,
  type WorktreeRemovalConfirmation,
  WorktreeRemovalError,
  type WorktreeRemovalReceipt,
  type WorktreeRemovalRequest,
  worktreeRemovalConfirmation,
  worktreeRemovalRefusal,
} from './worktree-removal';

/** One worktree as `worktree.list` reports it (the wire shape stays with the adapter). */
export interface ListedWorktree {
  readonly path: string;
  readonly branch?: string;
  readonly isDetached: boolean;
  readonly isLinkedWorktree: boolean;
  readonly openWorkspaceId?: string;
}

export interface WorktreeListing {
  readonly repoKey: string;
  readonly worktrees: readonly ListedWorktree[];
}

/** The branch the Agent's status line shows, read live from its Changes store. */
export type StatusLineBranch =
  | { readonly kind: 'named'; readonly name: string }
  | { readonly kind: 'detached' };

export type BranchPresentation =
  | { readonly kind: 'loading' }
  | { readonly kind: 'named'; readonly name: string }
  | { readonly kind: 'detached' }
  | { readonly kind: 'unavailable' };

export type RemovalPhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'removing' }
  | { readonly kind: 'removed'; readonly receipt: WorktreeRemovalReceipt }
  | { readonly kind: 'failed'; readonly message: Text }
  | { readonly kind: 'stale'; readonly message: Text }
  | { readonly kind: 'unconfirmed' };

export interface WorktreeDetailState {
  readonly branch: BranchPresentation;
  readonly confirmation: WorktreeRemovalConfirmation | undefined;
  readonly removalPhase: RemovalPhase;
  readonly showsFeedback: boolean;
  /** The refusal leaves uncommitted work possible, so its alert can offer Changes. */
  readonly refusalOffersChanges: boolean;
  /** The command that forces the refused removal, for the alert's Copy Command. */
  readonly refusalCommand: string | undefined;
}

export interface WorktreeDetailOptions {
  readonly request: WorktreeRemovalRequest;
  readonly workspaceLabel: string;
  readonly checkout: RepositoryCheckout;
  /** Recovery commands target the same endpoint or session as the removal. */
  readonly sessionName: string;
  readonly endpoint?: HerdrEndpoint;
  readonly list: (workspaceId: string) => Promise<WorktreeListing>;
  readonly remove: (request: WorktreeRemovalRequest) => Promise<WorktreeRemovalReceipt>;
  readonly hasWorkingAgent: () => boolean;
  readonly statusLineBranch?: () => StatusLineBranch | undefined;
  /** Opens Changes for a directory after the sheet dismisses; absent hides Show Changes. */
  readonly showChanges?: (directory: string) => void;
}

const isCancellation = (error: unknown) =>
  error instanceof TransportFailure && error.error.kind === 'cancelled';

/** The Worktree Details sheet's model: the branch, Show Changes, and a confirmed removal. */
export class WorktreeDetailStore extends Observable<WorktreeDetailState> {
  private didLoadBranch = false;
  /** Captured synchronously by the confirmation and consumed once when its removal starts. */
  private pendingRemovalId: string | undefined;

  constructor(private readonly options: WorktreeDetailOptions) {
    super({
      branch: { kind: 'loading' },
      confirmation: undefined,
      removalPhase: { kind: 'idle' },
      showsFeedback: false,
      refusalOffersChanges: false,
      refusalCommand: undefined,
    });
  }

  get request(): WorktreeRemovalRequest {
    return this.options.request;
  }

  get canRemove(): boolean {
    return this.options.checkout.isLinkedWorktree && this.getState().removalPhase.kind === 'idle';
  }

  /** The worktree's own directory, not the Agent's current directory. */
  get changesDirectory(): string {
    return this.options.checkout.checkoutPath;
  }

  /** Available except while a removal is in flight or done, and only if something can open Changes. */
  get canShowChanges(): boolean {
    if (!this.options.showChanges) return false;
    const { kind } = this.getState().removalPhase;
    return kind !== 'removing' && kind !== 'removed';
  }

  /** The worktree query's answer, or the status line's branch when it could not name one. */
  get displayedBranch(): BranchPresentation {
    const { branch } = this.getState();
    if (branch.kind !== 'unavailable') return branch;
    return this.options.statusLineBranch?.() ?? branch;
  }

  /** Hands the worktree directory to the sheet owner, which dismisses first. */
  showChanges(): void {
    if (!this.canShowChanges) return;
    const failed = this.getState().removalPhase.kind === 'failed';
    this.set({
      showsFeedback: false,
      refusalOffersChanges: false,
      refusalCommand: undefined,
      ...(failed ? { removalPhase: { kind: 'idle' } as const } : {}),
    });
    this.options.showChanges?.(this.changesDirectory);
  }

  async loadBranchIfNeeded(): Promise<void> {
    if (this.didLoadBranch) return;
    this.didLoadBranch = true;
    this.set({ branch: { kind: 'loading' } });
    const { identity } = this.options.request;
    try {
      const response = await this.options.list(identity.workspaceId);
      this.set({ branch: this.branchOf(response) });
    } catch (error) {
      if (isCancellation(error)) {
        this.didLoadBranch = false;
        this.set({ branch: { kind: 'loading' } });
      } else {
        this.set({ branch: { kind: 'unavailable' } });
      }
    }
  }

  retryBranch(): Promise<void> {
    this.didLoadBranch = false;
    return this.loadBranchIfNeeded();
  }

  private branchOf(response: WorktreeListing): BranchPresentation {
    const { identity } = this.options.request;
    if (response.repoKey !== identity.repoKey) return { kind: 'unavailable' };
    const entry = response.worktrees.find(
      (worktree) =>
        worktree.openWorkspaceId === identity.workspaceId &&
        worktree.path === identity.checkoutPath &&
        worktree.isLinkedWorktree,
    );
    if (!entry) return { kind: 'unavailable' };
    if (entry.branch) return { kind: 'named', name: entry.branch };
    return entry.isDetached ? { kind: 'detached' } : { kind: 'unavailable' };
  }

  /** Captures one immutable request in the dialog; final authorization comes just before the wire. */
  prepareConfirmation(): void {
    if (!this.canRemove) return;
    const shown = this.displayedBranch;
    const branch: ConfirmationBranch =
      shown.kind === 'named' || shown.kind === 'detached' ? shown : { kind: 'unavailable' };
    this.set({
      confirmation: worktreeRemovalConfirmation({
        request: this.options.request,
        workspaceLabel: this.options.workspaceLabel,
        branch,
        hasWorkingAgent: this.options.hasWorkingAgent(),
      }),
    });
  }

  cancelConfirmation(): void {
    this.set({ confirmation: undefined });
  }

  /**
   * Captures and transitions the exact confirmed request synchronously, so the dialog clearing
   * itself right after cannot lose it and a repeated tap finds nothing to confirm.
   */
  beginRemoval(): WorktreeRemovalRequest | undefined {
    const { confirmation } = this.getState();
    if (!this.canRemove || !confirmation) return undefined;
    this.pendingRemovalId = confirmation.request.id;
    this.set({ removalPhase: { kind: 'removing' }, confirmation: undefined });
    return confirmation.request;
  }

  async finishRemoval(request: WorktreeRemovalRequest): Promise<void> {
    if (this.pendingRemovalId !== request.id || request !== this.options.request) return;
    this.pendingRemovalId = undefined;
    try {
      const receipt = await this.options.remove(request);
      this.set({ removalPhase: { kind: 'removed', receipt } });
    } catch (error) {
      this.removalFailed(error, request);
    }
  }

  private removalFailed(error: unknown, request: WorktreeRemovalRequest): void {
    if (error instanceof WorktreeRemovalError && error.reason === 'staleIdentity') {
      const text = removalErrorMessage('staleIdentity');
      this.set({ removalPhase: { kind: 'stale', message: text }, showsFeedback: true });
    } else if (error instanceof WorktreeRemovalError && error.reason === 'outcomeUnconfirmed') {
      this.set({ removalPhase: { kind: 'unconfirmed' }, showsFeedback: true });
    } else if (isCancellation(error)) {
      this.set({ removalPhase: { kind: 'idle' } });
    } else {
      const refusal = worktreeRemovalRefusal(
        error,
        request,
        this.options.sessionName,
        this.options.endpoint ?? null,
      );
      this.set({
        removalPhase: { kind: 'failed', message: refusal.message },
        refusalOffersChanges: this.options.showChanges !== undefined && refusal.offersChanges,
        refusalCommand: refusal.command,
        showsFeedback: true,
      });
    }
  }

  dismissFeedback(): void {
    const failed = this.getState().removalPhase.kind === 'failed';
    this.set({
      showsFeedback: false,
      refusalOffersChanges: false,
      refusalCommand: undefined,
      ...(failed ? { removalPhase: { kind: 'idle' } as const } : {}),
    });
  }
}
