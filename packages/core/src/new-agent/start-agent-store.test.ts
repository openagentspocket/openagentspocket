import { describe, expect, it } from 'vitest';
import { HerdrApiError } from '../errors/herdr-api-error';
import { TransportFailure } from '../errors/transport-error';
import { StoredRecentWorkspaces } from './ports';
import { HOST, ready, setup, WORKSPACES } from './start-agent.test-util';

describe('host and agent selection', () => {
  it('preselects the only Host and leaves several unselected', () => {
    expect(setup().store.getState().selectedHostId).toBe('h1');
    const many = setup({ hosts: [HOST, { id: 'h2', name: 'Other' }] });
    expect(many.store.getState().selectedHostId).toBeUndefined();
  });

  it('publishes the Host kinds and selects the first', async () => {
    const { store, environment } = setup();
    environment.kinds = ['claude', 'codex'];
    await store.discoverAgents();
    expect(store.getState()).toMatchObject({
      availableKinds: ['claude', 'codex'],
      selectedKind: 'claude',
      discovery: { kind: 'loaded' },
    });
  });

  it('surfaces a detection failure and supports an empty result', async () => {
    const { store, environment } = setup();
    environment.kindsError = new TransportFailure({ kind: 'sshUnreachable', detail: 'down' });
    await store.discoverAgents();
    expect(store.getState().discovery.kind).toBe('failed');
    expect(store.canSubmit).toBe(false);
    environment.kindsError = undefined;
    environment.kinds = [];
    await store.discoverAgents();
    expect(store.getState().discovery.kind).toBe('loaded');
    expect(store.getState().selectedKind).toBeUndefined();
    expect(store.canSubmit).toBe(false);
  });

  it('ignores a stale detection that finishes after a Host switch', async () => {
    const { store, environment } = setup({ hosts: [HOST, { id: 'h2', name: 'Other' }] });
    store.selectHost('h1');
    let release: (kinds: readonly string[]) => void = () => undefined;
    environment.discoverAgentKinds = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    const pending = store.discoverAgents();
    store.selectHost('h2');
    release(['codex']);
    await pending;
    expect(store.getState().availableKinds).toEqual([]);
    expect(store.getState().discovery.kind).toBe('idle');
  });

  it('drops stale picks when the Host changes', async () => {
    const { store } = await ready({ hosts: [HOST, { id: 'h2', name: 'Other' }] });
    store.selectHost('h1');
    store.edit({ startsInNewWorktree: true, worktreeBranch: 'x', newWorkspaceDirectory: '/a' });
    store.selectNewWorkspace();
    store.selectHost('h2');
    expect(store.getState()).toMatchObject({
      launchTarget: 'existingWorkspace',
      newWorkspaceDirectory: '',
      startsInNewWorktree: false,
      worktreeBranch: '',
      availableKinds: [],
      selectedKind: undefined,
    });
  });
});

describe('workspace selection', () => {
  it('defaults to the first workspace, following a list that arrives late', () => {
    const { store, environment } = setup({ workspaces: false });
    expect(store.selectedWorkspaceId).toBeUndefined();
    environment.workspacesByHost.set('h1', WORKSPACES);
    expect(store.selectedWorkspaceId).toBe('w1');
  });

  it('prefers the workspace last started in, if the Host still reports it', async () => {
    const { store, environment, storage } = await ready();
    new StoredRecentWorkspaces(storage).remember('h1', 'w2');
    expect(store.selectedWorkspaceId).toBe('w2');
    new StoredRecentWorkspaces(storage).remember('h1', 'gone');
    expect(store.selectedWorkspaceId).toBe('w1');
    environment.workspacesByHost.set('h1', [WORKSPACES[1] ?? { id: 'w2', label: '', order: 0 }]);
    expect(store.selectedWorkspaceId).toBe('w2');
  });

  it('falls back when the explicit pick disappears', () => {
    const { store, environment } = setup();
    store.selectExistingWorkspace('w2');
    expect(store.selectedWorkspaceId).toBe('w2');
    environment.workspacesByHost.set('h1', [WORKSPACES[0] ?? { id: 'w1', label: '', order: 0 }]);
    expect(store.selectedWorkspaceId).toBe('w1');
  });

  it('ignores a stale workspace and a relative browsed directory', () => {
    const { store } = setup();
    store.applyBrowsedDirectory('relative/path');
    expect(store.getState().launchTarget).toBe('existingWorkspace');
    expect(store.getState().newWorkspaceDirectory).toBe('');
    store.applyBrowsedDirectory('/home/you/new-project');
    store.selectExistingWorkspace('gone');
    expect(store.getState().launchTarget).toBe('newWorkspace');
  });

  it('selecting an existing workspace replaces a browsed destination but keeps the directory', () => {
    const { store } = setup();
    store.applyBrowsedDirectory('/home/you/new');
    store.selectExistingWorkspace('w2');
    expect(store.getState()).toMatchObject({
      launchTarget: 'existingWorkspace',
      newWorkspaceDirectory: '/home/you/new',
    });
  });

  it('switching to a new Workspace drops the worktree request', () => {
    const { store } = setup();
    store.edit({ startsInNewWorktree: true, worktreeBranch: 'b', worktreeBase: 'main' });
    store.applyBrowsedDirectory('/home/you/new');
    expect(store.getState()).toMatchObject({
      startsInNewWorktree: false,
      worktreeBranch: '',
      worktreeBase: '',
    });
    expect(store.offersWorktree).toBe(false);
  });
});

describe('validation gates', () => {
  it('needs a Host, a workspace and a detected agent', async () => {
    const { store } = setup({ hosts: [HOST, { id: 'h2', name: 'Other' }] });
    expect(store.canSubmit).toBe(false);
    store.selectHost('h1');
    expect(store.canSubmit).toBe(false);
    await store.discoverAgents();
    expect(store.canSubmit).toBe(true);
  });

  it('cannot submit until the Host reports a workspace, but a new Workspace needs none', async () => {
    const { store } = await ready({ workspaces: false });
    expect(store.canSubmit).toBe(false);
    store.selectNewWorkspace();
    expect(store.canSubmit).toBe(true);
  });

  it('an invalid name, argument string or branch blocks submission', async () => {
    const { store, environment } = await ready();
    store.edit({ name: 'Bad Name' });
    expect(store.canSubmit).toBe(false);
    await store.submit();
    expect(environment.starts).toEqual([]);
    store.edit({ name: '', arguments: '"open' });
    expect(store.argumentError).toBeDefined();
    expect(store.canSubmit).toBe(false);
    store.edit({ arguments: '', startsInNewWorktree: true, worktreeBranch: 'a..b' });
    expect(store.worktreeBranchError).toBeDefined();
    expect(store.canSubmit).toBe(false);
    store.edit({ worktreeBranch: '' });
    expect(store.canSubmit).toBe(true);
  });

  it('a branch is only validated while the worktree toggle is on', async () => {
    const { store } = await ready();
    store.edit({ worktreeBranch: 'a..b' });
    expect(store.worktreeBranchError).toBeUndefined();
  });
});

describe('submit', () => {
  it('forwards the assembled request and lands started', async () => {
    const { store, environment } = await ready();
    store.edit({ name: ' helper ', arguments: '--model "gpt 5"', tabLabel: '  Tab  ' });
    await store.submit();
    expect(environment.starts).toEqual([
      {
        hostId: 'h1',
        destination: { kind: 'existingWorkspace' },
        request: {
          kind: 'claude',
          name: 'helper',
          arguments: ['--model', 'gpt 5'],
          workspaceId: 'w1',
          cwd: undefined,
          tabLabel: 'Tab',
        },
      },
    ]);
    expect(store.getState().phase).toEqual({ kind: 'started', hostId: 'h1', paneId: 'w1:pnew' });
    expect(environment.visibleWaits).toEqual([['h1', 'w1:pnew']]);
  });

  it('an empty name falls back to the kind, skipping taken names', async () => {
    const { store, environment } = await ready();
    environment.namesByHost.set('h1', new Set(['claude', 'claude-2']));
    expect(store.defaultName).toBe('claude-3');
    await store.submit();
    expect(environment.starts[0]?.request.name).toBe('claude-3');
  });

  it('drops an empty tab label', async () => {
    const { store, environment } = await ready();
    store.edit({ tabLabel: '   ' });
    await store.submit();
    expect(environment.starts[0]?.request.tabLabel).toBeUndefined();
  });

  it('remembers the workspace and directory only after a success', async () => {
    const { store, environment, recents, storage } = await ready();
    store.selectExistingWorkspace('w1');
    environment.startError = new HerdrApiError('boom', 'no');
    await store.submit();
    expect(store.getState().phase.kind).toBe('failed');
    expect(new StoredRecentWorkspaces(storage).workspaceId('h1')).toBeUndefined();
    expect(recents.remembered).toEqual([]);
    environment.startError = undefined;
    await store.submit();
    expect(new StoredRecentWorkspaces(storage).workspaceId('h1')).toBe('w1');
    expect(recents.remembered).toEqual([['h1', '/work/app']]);
  });

  it('a new worktree forwards the trimmed spec and records its source checkout', async () => {
    const { store, environment, recents } = await ready();
    store.edit({ startsInNewWorktree: true, worktreeBranch: ' feat/x ', worktreeBase: ' main ' });
    await store.submit();
    expect(environment.starts[0]?.destination).toEqual({
      kind: 'newWorktree',
      branch: 'feat/x',
      base: 'main',
    });
    expect(environment.starts[0]?.request.workspaceId).toBe('w1');
    expect(recents.remembered).toEqual([['h1', '/work/app']]);
  });

  it('empty worktree fields use the defaults', async () => {
    const { store, environment } = await ready();
    store.edit({ startsInNewWorktree: true });
    await store.submit();
    expect(environment.starts[0]?.destination).toEqual({
      kind: 'newWorktree',
      branch: undefined,
      base: undefined,
    });
  });

  it('a new Workspace trims the directory, drops an empty label, and sends no workspace id, remembering the new one', async () => {
    const { store, environment, storage } = await ready();
    store.applyBrowsedDirectory('/home/you/proj');
    store.edit({ newWorkspaceDirectory: '  /home/you/proj  ', newWorkspaceLabel: '   ' });
    environment.startResult = { paneId: 'w9:p1', workspaceId: 'w9' };
    await store.submit();
    expect(environment.starts[0]?.destination).toEqual({
      kind: 'newWorkspace',
      directory: '/home/you/proj',
      label: undefined,
    });
    expect(environment.starts[0]?.request.workspaceId).toBeUndefined();
    expect(new StoredRecentWorkspaces(storage).workspaceId('h1')).toBe('w9');
    expect(store.getState().phase).toMatchObject({ kind: 'started', paneId: 'w9:p1' });
  });

  it('a name-only new Workspace falls back to the Host home, Windows paths included', async () => {
    const { store, environment } = await ready();
    environment.home = 'C:\\Users\\dev';
    store.selectNewWorkspace();
    await store.submit();
    store.applyBrowsedDirectory('D:/Projects/new workspace');
    await store.submit();
    expect(environment.starts.map((start) => start.destination)).toEqual([
      { kind: 'newWorkspace', directory: 'C:\\Users\\dev', label: undefined },
      { kind: 'newWorkspace', directory: 'D:/Projects/new workspace', label: undefined },
    ]);
  });

  it('reports a home directory that cannot be resolved or used', async () => {
    const { store, environment } = await ready();
    store.selectNewWorkspace();
    environment.home = new TransportFailure({ kind: 'timedOut' });
    await store.submit();
    expect(store.getState().phase.kind).toBe('failed');
    expect(environment.starts).toEqual([]);
    environment.home = 'relative';
    await store.submit();
    expect(store.getState().phase.kind).toBe('failed');
    expect(environment.starts).toEqual([]);
  });

  it('blocks a duplicate submit and dismissal while a launch is in flight', async () => {
    const { store, environment } = await ready();
    let open: () => void = () => undefined;
    environment.gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const first = store.submit();
    const second = store.submit();
    await Promise.resolve();
    expect(store.canDismiss).toBe(false);
    expect(store.canSubmit).toBe(false);
    open();
    await Promise.all([first, second]);
    expect(environment.starts).toHaveLength(1);
    expect(store.canDismiss).toBe(true);
  });

  it('is a no-op without a Host or a detected agent', async () => {
    const { store, environment } = setup({ hosts: [HOST, { id: 'h2', name: 'Other' }] });
    await store.submit();
    store.selectHost('h1');
    await store.submit();
    expect(environment.starts).toEqual([]);
    expect(store.getState().phase.kind).toBe('editing');
  });

  it('maps worktree and rejection failures to first-class messages', async () => {
    const { store, environment } = await ready();
    const failure = async (error: unknown) => {
      environment.startError = error;
      await store.submit();
      const { phase } = store.getState();
      return phase.kind === 'failed' ? phase.message : undefined;
    };
    expect(await failure(new HerdrApiError('not_git_worktree', 'x'))).toMatchObject({
      key: expect.stringContaining('Git repository'),
    });
    expect(await failure(new HerdrApiError('worktree_create_failed', 'fatal: x'))).toMatchObject({
      args: ['fatal: x'],
    });
    expect(await failure(new HerdrApiError('other', 'nope'))).toMatchObject({ args: ['nope'] });
    expect(
      await failure(new TransportFailure({ kind: 'sshUnreachable', detail: '' })),
    ).toMatchObject({ key: 'The Host is not connected.' });
  });

  it('explains a Muse rejection by the kind captured at submit', async () => {
    const { store, environment } = setup();
    environment.kinds = ['muse', 'claude'];
    await store.discoverAgents();
    let release: () => void = () => undefined;
    environment.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    environment.startError = new HerdrApiError('unsupported_agent_kind', 'no muse');
    const pending = store.submit();
    store.edit({ selectedKind: 'claude' });
    release();
    await pending;
    const { phase } = store.getState();
    expect(phase.kind === 'failed' && phase.message).toMatchObject({
      key: expect.stringContaining('Muse'),
    });
  });
});
