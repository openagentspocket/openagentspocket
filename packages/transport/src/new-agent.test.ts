import { type FakeClock, type JsonObject, WorktreeRemovalError } from '@openagentspocket/core';
import { utf8Decode, utf8Encode } from 'agentico-ssh';
import { describe, expect, it } from 'vitest';
import { launchAgent, listWorktreeEntries, WorktreeRemover } from './new-agent';
import { connected, methodOf, paramsOf } from './test-helpers';

const PANE = { pane_id: 'p1', tab_id: 't1', terminal_id: 'term1', workspace_id: 'w1' };
const AGENT = {
  ...PANE,
  agent_status: 'working',
  cwd: '/work/app',
  focused: false,
  revision: 1,
};
const WORKTREE = {
  branch: 'feat/x',
  is_bare: false,
  is_detached: false,
  is_linked_worktree: true,
  is_prunable: false,
  label: 'x',
  open_workspace_id: 'w1',
  path: '/work/wt',
};

interface Call {
  method: string;
  params: JsonObject;
}

type Answer = { result: object } | { error: { code: string; message: string } };

async function herdr(overrides: Record<string, Answer> = {}) {
  const calls: Call[] = [];
  const { transport, settings } = await connected((_s, request) => {
    const method = methodOf(request);
    calls.push({ method, params: paramsOf(request) });
    const { id } = JSON.parse(utf8Decode(request)) as { id: string };
    const line = (body: object) => utf8Encode(`${JSON.stringify({ id, ...body })}\n`);
    const override = overrides[method];
    if (override) return line(override);
    switch (method) {
      case 'agent.start':
        return line({ result: { type: 'agent_started', agent: AGENT, argv: [] } });
      case 'tab.create':
        return line({ result: { type: 'tab_created', tab: { tab_id: 't1' }, root_pane: PANE } });
      case 'workspace.create':
        return line({
          result: {
            type: 'workspace_created',
            workspace: { workspace_id: 'w2' },
            tab: { tab_id: 't1' },
            root_pane: PANE,
          },
        });
      case 'worktree.create':
        return line({
          result: {
            type: 'worktree_created',
            workspace: { workspace_id: 'w3' },
            tab: { tab_id: 't1' },
            root_pane: PANE,
            worktree: WORKTREE,
          },
        });
      case 'worktree.list':
        return line({
          result: {
            type: 'worktree_list',
            source: { repo_key: '/repo/.git', repo_name: 'repo', repo_root: '/repo' },
            worktrees: [WORKTREE],
          },
        });
      case 'worktree.remove':
        return line({
          result: { type: 'worktree_removed', forced: false, path: '/work/wt', workspace_id: 'w1' },
        });
      default:
        return line({ result: { type: 'ok' } });
    }
  });
  return { transport, clock: settings.clock as FakeClock, calls };
}

const REQUEST = {
  kind: 'claude',
  name: 'claude',
  arguments: ['--x'],
  workspaceId: 'w1',
  tabLabel: 'Tab',
};

describe('launchAgent', () => {
  it('starts in an existing workspace through a fresh tab', async () => {
    const { transport, clock, calls } = await herdr();
    const agent = await launchAgent(transport, clock, REQUEST, { kind: 'existingWorkspace' });
    expect(agent).toEqual({ paneId: 'p1', workspaceId: 'w1', cwd: '/work/app' });
    expect(calls.map((call) => call.method)).toEqual(['tab.create', 'agent.start']);
    expect(calls[0]?.params).toMatchObject({ workspace_id: 'w1', label: 'Tab' });
  });

  it('a new worktree asks herdr for one of the workspace and starts in it', async () => {
    const { transport, clock, calls } = await herdr();
    await launchAgent(transport, clock, REQUEST, {
      kind: 'newWorktree',
      branch: 'feat/x',
      base: 'main',
    });
    expect(calls.map((call) => call.method)).toEqual([
      'worktree.create',
      'agent.start',
      'tab.rename',
    ]);
    expect(calls[0]?.params).toMatchObject({ workspace_id: 'w1', branch: 'feat/x', base: 'main' });
  });

  it('a new workspace carries the directory and label, and no workspace id', async () => {
    const { transport, clock, calls } = await herdr();
    await launchAgent(
      transport,
      clock,
      { ...REQUEST, cwd: '/ignored' },
      { kind: 'newWorkspace', directory: '/home/you/proj', label: 'Proj' },
    );
    expect(calls[0]).toMatchObject({
      method: 'workspace.create',
      params: { cwd: '/home/you/proj', label: 'Proj' },
    });
  });

  it('removes the new workspace when its agent cannot start, rethrowing herdr', async () => {
    const { transport, clock, calls } = await herdr({
      'agent.start': { error: { code: 'agent_kind_unknown', message: 'no' } },
    });
    await expect(
      launchAgent(transport, clock, REQUEST, { kind: 'newWorkspace', directory: '/d' }),
    ).rejects.toMatchObject({ code: 'agent_kind_unknown' });
    expect(calls.at(-1)).toMatchObject({
      method: 'workspace.close',
      params: { workspace_id: 'w2' },
    });
  });
});

describe('listWorktreeEntries', () => {
  it('maps the wire list', async () => {
    const { transport } = await herdr();
    expect(await listWorktreeEntries(transport, 'w1')).toEqual({
      repoKey: '/repo/.git',
      worktrees: [
        {
          path: '/work/wt',
          branch: 'feat/x',
          isDetached: false,
          isLinkedWorktree: true,
          openWorkspaceId: 'w1',
        },
      ],
    });
  });
});

describe('WorktreeRemover', () => {
  const identity = {
    hostId: 'h1',
    workspaceId: 'w1',
    repoKey: '/repo/.git',
    checkoutPath: '/work/wt',
  };
  const request = { id: 'r1', identity };
  const allow = { authorize: () => new Set(['h1:p1']) };

  it('authorizes, removes, and returns the affected agents', async () => {
    const { transport, calls } = await herdr();
    const receipt = await new WorktreeRemover(transport).remove(request, allow);
    expect([...receipt.affectedAgentKeys]).toEqual(['h1:p1']);
    expect(calls.map((call) => call.method)).toEqual(['worktree.remove']);
    expect(calls[0]?.params).toEqual({ workspace_id: 'w1' });
  });

  it('writes nothing when the proof is stale', async () => {
    const { transport, calls } = await herdr();
    const stale = {
      authorize: () => {
        throw new WorktreeRemovalError('staleIdentity');
      },
    };
    await expect(new WorktreeRemover(transport).remove(request, stale)).rejects.toMatchObject({
      reason: 'staleIdentity',
    });
    expect(calls).toEqual([]);
  });

  it('passes herdr rejections through and reports an answer for another workspace as unconfirmed', async () => {
    const rejected = await herdr({
      'worktree.remove': { error: { code: 'dirty_worktree_requires_force', message: 'dirty' } },
    });
    await expect(
      new WorktreeRemover(rejected.transport).remove(request, allow),
    ).rejects.toMatchObject({
      code: 'dirty_worktree_requires_force',
    });
    const other = await herdr({
      'worktree.remove': {
        result: { type: 'worktree_removed', forced: false, path: '/x', workspace_id: 'w9' },
      },
    });
    await expect(new WorktreeRemover(other.transport).remove(request, allow)).rejects.toMatchObject(
      {
        reason: 'outcomeUnconfirmed',
      },
    );
  });

  it('refuses a second removal of the same worktree while one is running', async () => {
    const { transport } = await herdr();
    const remover = new WorktreeRemover(transport);
    const first = remover.remove(request, allow);
    await expect(remover.remove({ ...request, id: 'r2' }, allow)).rejects.toMatchObject({
      reason: 'alreadyInProgress',
    });
    await first;
  });
});
