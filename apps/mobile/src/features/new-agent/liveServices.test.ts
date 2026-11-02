import {
  type ConsoleRow,
  FakeClock,
  FakeRecentDirectories,
  type herdr,
  MemoryStorage,
  type MethodResult,
  type ParamsOf,
  StoredRecentWorkspaces,
  type WireMethod,
} from '@openagentspocket/core';
import { HerdrApi } from '@openagentspocket/transport';
import { createLiveServices, type LiveConsole, VISIBLE_WAIT_MS } from './liveServices';

const PANE = { pane_id: 'p9', tab_id: 't1', terminal_id: 'term9', workspace_id: 'w1' };

/** A herdr that records requests and answers the few the flows make. */
class ScriptedApi extends HerdrApi {
  readonly methods: string[] = [];

  async request<M extends WireMethod>(method: M, _params?: ParamsOf<M>): Promise<MethodResult<M>> {
    this.methods.push(method);
    const answers: Record<string, object> = {
      'tab.create': { type: 'tab_created', tab: { tab_id: 't1' }, root_pane: PANE },
      'agent.start': {
        type: 'agent_started',
        agent: { ...PANE, agent_status: 'working', focused: false, revision: 1 },
        argv: [],
      },
      'worktree.remove': {
        type: 'worktree_removed',
        forced: false,
        path: '/work/wt',
        workspace_id: 'w1',
      },
    };
    // The scripted answers are the wire shapes of these methods; the test is the type boundary.
    return answers[method] as MethodResult<M>;
  }
}

function row(over: Partial<herdr.AgentInfo> = {}, linked = true): ConsoleRow {
  return {
    hostId: 'h1',
    hostName: 'Box',
    agent: {
      agent: 'claude',
      agent_status: 'working',
      focused: false,
      pane_id: 'p1',
      revision: 1,
      tab_id: 't1',
      terminal_id: 'term1',
      workspace_id: 'w1',
      ...over,
    },
    workspaceLabel: 'wt',
    workspaceTabCount: 1,
    tabPaneCount: 1,
    checkout: {
      repoKey: '/repo/.git',
      repoName: 'repo',
      repoRoot: '/repo',
      checkoutPath: '/work/wt',
      isLinkedWorktree: linked,
    },
  };
}

function setup(initialRows: ConsoleRow[] = [row()]) {
  const api = new ScriptedApi();
  const listeners = new Set<() => void>();
  let rows = initialRows;
  const console: LiveConsole = {
    getState: () => ({ rows }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    workspaces: () => [{ id: 'w1', label: 'wt', order: 0, checkoutPath: '/work/wt' }],
    mutate: (_hostId, operation) => operation(api),
  };
  const clock = new FakeClock();
  const services = createLiveServices({
    console,
    clock,
    hosts: () => [{ id: 'h1', name: 'Box' }],
    discoverAgentKinds: async () => ['claude'],
    remoteHome: async () => '/home/you',
    fileBrowserHost: () => {
      throw new Error('unused');
    },
    session: () => ({ sessionName: '' }),
    recentWorkspaces: new StoredRecentWorkspaces(new MemoryStorage()),
    recentDirectories: new FakeRecentDirectories(),
  });
  return {
    api,
    clock,
    services,
    setRows: (next: ConsoleRow[]) => {
      rows = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

describe('live environment', () => {
  it('reads names and directories from the Console and launches through the transport', async () => {
    const { services, api } = setup([row({ name: 'claude', cwd: '/work/wt' })]);
    const { environment } = services;
    expect([...environment.existingAgentNames('h1')]).toEqual(['claude']);
    expect(environment.liveDirectories('h1')).toEqual(['/work/wt']);
    const started = await environment.start(
      { kind: 'claude', name: 'claude-2', arguments: [], workspaceId: 'w1' },
      { kind: 'existingWorkspace' },
      'h1',
    );
    expect(started.paneId).toBe('p9');
    expect(api.methods).toEqual(['tab.create', 'agent.start']);
  });

  it('waits for the started Agent to show in the Console, then for no longer than the budget', async () => {
    const first = setup([]);
    let done = false;
    const waiting = first.services.environment.awaitAgentVisible('h1', 'p9').then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    first.setRows([row({ pane_id: 'p9' })]);
    await waiting;
    expect(done).toBe(true);

    const second = setup([]);
    const late = second.services.environment.awaitAgentVisible('h1', 'p9');
    await second.clock.advance(VISIBLE_WAIT_MS);
    await late;
  });
});

describe('live Worktree Details', () => {
  it('is offered only for a linked worktree', () => {
    expect(setup([row()]).services.worktreeDetail('h1', 'p1')).toBeDefined();
    expect(setup([row({}, false)]).services.worktreeDetail('h1', 'p1')).toBeUndefined();
    expect(setup([row()]).services.worktreeDetail('h1', 'gone')).toBeUndefined();
  });

  it('removes the worktree and names the Agents it ends, working or not', async () => {
    const { services, api } = setup([row(), row({ pane_id: 'p2', agent_status: 'idle' })]);
    const options = services.worktreeDetail('h1', 'p1');
    if (!options) throw new Error('no detail');
    expect(options.hasWorkingAgent()).toBe(true);
    const receipt = await options.remove(options.request);
    expect(api.methods).toEqual(['worktree.remove']);
    expect(receipt.affectedAgentKeys.size).toBe(2);
  });

  it('writes nothing when the snapshot no longer shows the worktree', async () => {
    const { services, api, setRows } = setup();
    const options = services.worktreeDetail('h1', 'p1');
    if (!options) throw new Error('no detail');
    setRows([]);
    await expect(options.remove(options.request)).rejects.toMatchObject({
      reason: 'staleIdentity',
    });
    expect(api.methods).toEqual([]);
  });
});
