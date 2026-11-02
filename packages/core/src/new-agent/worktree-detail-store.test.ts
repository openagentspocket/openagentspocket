import { describe, expect, it } from 'vitest';
import { HerdrApiError } from '../errors/herdr-api-error';
import { renderText } from '../errors/text';
import { TransportFailure } from '../errors/transport-error';
import {
  type StatusLineBranch,
  type WorktreeDetailOptions,
  WorktreeDetailStore,
  type WorktreeListing,
} from './worktree-detail-store';
import {
  identityMatches,
  WorktreeRemovalError,
  type WorktreeRemovalReceipt,
  type WorktreeRemovalRequest,
  worktreeIdentity,
  worktreeRemovalRequest,
} from './worktree-removal';

const CHECKOUT = {
  repoKey: '/repo/.git',
  repoName: 'repo',
  repoRoot: '/repo',
  checkoutPath: '/work/wt',
  isLinkedWorktree: true,
};
const DIRTY = 'fatal: contains modified or untracked files, use --force to delete it';
const SUBMODULE = 'fatal: working trees containing submodules cannot be moved or removed';

function listing(branch: string | undefined, detached = false): WorktreeListing {
  return {
    repoKey: '/repo/.git',
    worktrees: [
      {
        path: '/work/wt',
        branch,
        isDetached: detached,
        isLinkedWorktree: true,
        openWorkspaceId: 'w1',
      },
    ],
  };
}

function setup(overrides: Partial<WorktreeDetailOptions> = {}) {
  const request = worktreeRemovalRequest(worktreeIdentity('h1', 'w1', CHECKOUT));
  const removed: WorktreeRemovalRequest[] = [];
  const handed: string[] = [];
  const store = new WorktreeDetailStore({
    request,
    workspaceLabel: 'issue-99',
    checkout: CHECKOUT,
    sessionName: '',
    list: async () => listing('feat/issue-99'),
    remove: async (req): Promise<WorktreeRemovalReceipt> => {
      removed.push(req);
      return { request: req, affectedAgentKeys: new Set() };
    },
    hasWorkingAgent: () => false,
    showChanges: (directory) => handed.push(directory),
    ...overrides,
  });
  return { store, request, removed, handed };
}

async function refused(error: unknown, overrides: Partial<WorktreeDetailOptions> = {}) {
  const context = setup({ remove: () => Promise.reject(error), ...overrides });
  context.store.prepareConfirmation();
  const request = context.store.beginRemoval();
  if (!request) throw new Error('no request');
  await context.store.finishRemoval(request);
  return context;
}

const text = (store: WorktreeDetailStore) => {
  const { removalPhase } = store.getState();
  return removalPhase.kind === 'failed' ? renderText(removalPhase.message) : '';
};

describe('identity', () => {
  it('requires the repository, the checkout path and a linked worktree', () => {
    const identity = worktreeIdentity('h1', 'w1', CHECKOUT);
    expect(identityMatches(identity, CHECKOUT)).toBe(true);
    expect(identityMatches(identity, { ...CHECKOUT, checkoutPath: '/work/other' })).toBe(false);
    expect(identityMatches(identity, { ...CHECKOUT, isLinkedWorktree: false })).toBe(false);
  });
});

describe('branch', () => {
  it('shows the scoped list answer', async () => {
    const { store } = setup();
    await store.loadBranchIfNeeded();
    expect(store.getState().branch).toEqual({ kind: 'named', name: 'feat/issue-99' });
  });

  it('reads a detached HEAD and an answer from another repository as such', async () => {
    const detached = setup({ list: async () => listing(undefined, true) });
    await detached.store.loadBranchIfNeeded();
    expect(detached.store.getState().branch.kind).toBe('detached');
    const other = setup({ list: async () => ({ ...listing('x'), repoKey: '/other/.git' }) });
    await other.store.loadBranchIfNeeded();
    expect(other.store.getState().branch.kind).toBe('unavailable');
  });

  it('falls back to the status line only when the query cannot name one', async () => {
    const named: StatusLineBranch = { kind: 'named', name: 'status-branch' };
    const failing = setup({
      list: () => Promise.reject(new Error('x')),
      statusLineBranch: () => named,
    });
    await failing.store.loadBranchIfNeeded();
    expect(failing.store.displayedBranch).toEqual(named);
    const wins = setup({ statusLineBranch: () => named });
    await wins.store.loadBranchIfNeeded();
    expect(wins.store.displayedBranch).toEqual({ kind: 'named', name: 'feat/issue-99' });
    const none = setup({ list: () => Promise.reject(new Error('x')) });
    await none.store.loadBranchIfNeeded();
    expect(none.store.displayedBranch.kind).toBe('unavailable');
  });

  it('a cancelled query loads again, and Retry reloads', async () => {
    let calls = 0;
    const { store } = setup({
      list: async () => {
        calls += 1;
        if (calls === 1) throw new TransportFailure({ kind: 'cancelled' });
        return listing('b');
      },
    });
    await store.loadBranchIfNeeded();
    expect(store.getState().branch.kind).toBe('loading');
    await store.loadBranchIfNeeded();
    expect(store.getState().branch).toEqual({ kind: 'named', name: 'b' });
    await store.retryBranch();
    expect(calls).toBe(3);
  });
});

describe('removal', () => {
  it('the confirmation names the blast radius, the kept branch and a working Agent', async () => {
    const { store } = setup({ hasWorkingAgent: () => true });
    await store.loadBranchIfNeeded();
    store.prepareConfirmation();
    const sentences = renderText(store.getState().confirmation?.message ?? '');
    expect(sentences).toContain('/work/wt');
    expect(sentences).toContain('feat/issue-99');
    expect(sentences.split('. ').length).toBeGreaterThanOrEqual(4);
  });

  it('cancelling sends no removal', () => {
    const { store, removed } = setup();
    store.prepareConfirmation();
    store.cancelConfirmation();
    expect(store.beginRemoval()).toBeUndefined();
    expect(removed).toEqual([]);
  });

  it('a repeated confirmation dispatches exactly once', async () => {
    let open: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const calls: string[] = [];
    const { store } = setup({
      remove: async (request) => {
        calls.push(request.id);
        await gate;
        return { request, affectedAgentKeys: new Set() };
      },
    });
    store.prepareConfirmation();
    const request = store.beginRemoval();
    expect(request).toBeDefined();
    expect(store.beginRemoval()).toBeUndefined();
    if (!request) return;
    const first = store.finishRemoval(request);
    await store.finishRemoval(request);
    expect(calls).toHaveLength(1);
    open();
    await first;
    expect(store.getState().removalPhase.kind).toBe('removed');
  });

  it('dismissing the dialog after the action cannot clear the captured removal', async () => {
    const { store, removed } = setup();
    store.prepareConfirmation();
    const request = store.beginRemoval();
    store.cancelConfirmation();
    if (!request) throw new Error('no request');
    await store.finishRemoval(request);
    expect(removed).toEqual([request]);
    expect(store.getState().removalPhase.kind).toBe('removed');
  });

  it('only a linked worktree can be removed', () => {
    const { store } = setup({ checkout: { ...CHECKOUT, isLinkedWorktree: false } });
    expect(store.canRemove).toBe(false);
    store.prepareConfirmation();
    expect(store.getState().confirmation).toBeUndefined();
  });

  it('a server failure stays on the detail and can retry', async () => {
    const { store } = await refused(new HerdrApiError('boom', 'no'));
    expect(store.getState()).toMatchObject({ showsFeedback: true });
    expect(store.getState().removalPhase.kind).toBe('failed');
    store.dismissFeedback();
    expect(store.getState().removalPhase.kind).toBe('idle');
    expect(store.canRemove).toBe(true);
  });

  it('an uncertain outcome is never reported as success', async () => {
    const { store } = await refused(new WorktreeRemovalError('outcomeUnconfirmed'));
    expect(store.getState().removalPhase.kind).toBe('unconfirmed');
    expect(store.getState().showsFeedback).toBe(true);
    const stale = await refused(new WorktreeRemovalError('staleIdentity'));
    expect(stale.store.getState().removalPhase.kind).toBe('stale');
    expect(stale.store.canRemove).toBe(false);
  });

  it('a transport cancellation restores idle without feedback', async () => {
    const { store } = await refused(new TransportFailure({ kind: 'cancelled' }));
    expect(store.getState()).toMatchObject({
      removalPhase: { kind: 'idle' },
      showsFeedback: false,
    });
  });
});

describe('refusals', () => {
  it('a dirty refusal offers Changes for the worktree directory, over herdr or the transport', async () => {
    for (const error of [
      new HerdrApiError('dirty_worktree_requires_force', DIRTY),
      new TransportFailure({
        kind: 'apiRejected',
        code: 'dirty_worktree_requires_force',
        message: DIRTY,
      }),
    ]) {
      const { store, handed } = await refused(error);
      expect(store.getState().refusalOffersChanges).toBe(true);
      expect(store.getState().refusalCommand).toBeUndefined();
      store.showChanges();
      expect(handed).toEqual(['/work/wt']);
      expect(store.getState()).toMatchObject({
        showsFeedback: false,
        refusalOffersChanges: false,
        removalPhase: { kind: 'idle' },
      });
    }
  });

  it('other refusals do not offer Changes, but Show Changes stays available', async () => {
    for (const error of [
      new HerdrApiError('workspace_not_found', 'gone'),
      new TransportFailure({ kind: 'sshUnreachable', detail: 'down' }),
    ]) {
      const { store } = await refused(error);
      expect(store.getState().refusalOffersChanges).toBe(false);
      expect(store.canShowChanges).toBe(true);
    }
  });

  it('no Changes offer without a handler, nor while removing or removed', async () => {
    const { store } = await refused(new HerdrApiError('dirty_worktree_requires_force', DIRTY), {
      showChanges: undefined,
    });
    expect(store.getState().refusalOffersChanges).toBe(false);
    expect(store.canShowChanges).toBe(false);
    const ok = setup();
    ok.store.prepareConfirmation();
    const request = ok.store.beginRemoval();
    expect(ok.store.canShowChanges).toBe(false);
    if (request) await ok.store.finishRemoval(request);
    expect(ok.store.canShowChanges).toBe(false);
  });

  it('dismissing the refusal withdraws the offer and the command', async () => {
    const { store } = await refused(new HerdrApiError('dirty_worktree_requires_force', SUBMODULE));
    expect(store.getState().refusalCommand).toBeDefined();
    store.dismissFeedback();
    expect(store.getState()).toMatchObject({
      refusalOffersChanges: false,
      refusalCommand: undefined,
      showsFeedback: false,
      removalPhase: { kind: 'idle' },
    });
  });

  it('a submodule refusal hands over the forced removal command, in any case', async () => {
    const { store } = await refused(
      new HerdrApiError('dirty_worktree_requires_force', SUBMODULE.toUpperCase()),
    );
    expect(store.getState().refusalCommand).toBe('herdr worktree remove --workspace w1 --force');
    expect(text(store)).toContain('herdr worktree remove --workspace w1 --force');
    expect(text(store)).toContain('/work/wt');
    expect(store.getState().refusalOffersChanges).toBe(true);
  });

  it('the submodule text under another code gets herdr text, with no command', async () => {
    const { store } = await refused(new HerdrApiError('something_else', SUBMODULE));
    expect(store.getState().refusalCommand).toBeUndefined();
    expect(text(store)).toContain(SUBMODULE);
  });

  it('a named session or an endpoint scopes the forced removal', async () => {
    const named = await refused(new HerdrApiError('dirty_worktree_requires_force', SUBMODULE), {
      sessionName: 'work',
    });
    expect(named.store.getState().refusalCommand).toBe(
      'herdr --session work worktree remove --workspace w1 --force',
    );
    const endpoint = {
      executablePath: '/opt/herdr/bin/herdr',
      socketPath: '/run/herdr/herdr.sock',
    };
    const pinned = await refused(new HerdrApiError('dirty_worktree_requires_force', SUBMODULE), {
      sessionName: 'work',
      endpoint,
    });
    const command = pinned.store.getState().refusalCommand ?? '';
    expect(command).toContain('/run/herdr/herdr.sock');
    expect(command).toContain('/opt/herdr/bin/herdr');
    expect(command).not.toContain('--session');
  });

  it('a workspace id that only resembles an option keeps the command; a real option loses it', async () => {
    const run = async (workspaceId: string) => {
      const request = worktreeRemovalRequest({
        hostId: 'h1',
        workspaceId,
        repoKey: CHECKOUT.repoKey,
        checkoutPath: CHECKOUT.checkoutPath,
      });
      const context = setup({
        request,
        remove: () => Promise.reject(new HerdrApiError('dirty_worktree_requires_force', SUBMODULE)),
      });
      context.store.prepareConfirmation();
      await context.store.finishRemoval(context.store.beginRemoval() ?? request);
      return context.store.getState().refusalCommand;
    };
    for (const word of ['--session', '--session=other', '--handoff', '--remote=other']) {
      expect(await run(word), word).toBeUndefined();
    }
    expect(await run('--sessions')).toBeDefined();
    expect(await run('w1')).toBeDefined();
  });
});
