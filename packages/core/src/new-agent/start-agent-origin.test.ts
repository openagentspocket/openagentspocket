import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../hosts/known-hosts';
import { FakeNewAgentEnvironment } from './fake-environment';
import {
  FakeRecentDirectories,
  type LaunchOrigin,
  type RecentDirectory,
  StoredRecentWorkspaces,
} from './ports';
import { HOST, ready, setup, WORKSPACES } from './start-agent.test-util';
import { StartAgentStore } from './start-agent-store';

describe('origin launches', () => {
  const origin: LaunchOrigin = { hostId: 'h1', workspaceId: 'wo', cwd: '/work/origin' };

  it('inherit the Agent Host, workspace and directory, even before a snapshot lands', async () => {
    const { store, environment } = await ready({ origin, workspaces: false });
    expect(store.selectedWorkspaceId).toBe('wo');
    expect(store.offersWorktree).toBe(false);
    expect(store.offersNewWorkspace).toBe(false);
    await store.submit();
    expect(environment.starts[0]).toMatchObject({
      destination: { kind: 'existingWorkspace' },
      request: { workspaceId: 'wo', cwd: '/work/origin' },
    });
  });

  it('never takes the worktree or new Workspace variants', async () => {
    const { store, environment } = await ready({ origin });
    store.edit({ startsInNewWorktree: true });
    store.applyBrowsedDirectory('/home/you/x');
    await store.submit();
    expect(environment.starts[0]?.destination).toEqual({ kind: 'existingWorkspace' });
    await store.loadRecentDirectories();
    expect(store.getState().recentDirectories).toEqual([]);
  });
});

describe('recent directories', () => {
  const entry = (path: string): RecentDirectory => ({ path, displayPath: path, name: path });

  it('shows the app-known list at once, then the Host refinement', async () => {
    const environment = new FakeNewAgentEnvironment();
    environment.workspacesByHost.set('h1', WORKSPACES);
    const recents = new FakeRecentDirectories([entry('/a')]);
    recents.refinement = [entry('/b')];
    const store = new StartAgentStore({
      hosts: [HOST],
      environment,
      recentWorkspaces: new StoredRecentWorkspaces(new MemoryStorage()),
      recentDirectories: recents,
    });
    const loading = store.loadRecentDirectories();
    expect(store.getState().recentDirectories).toEqual([entry('/a')]);
    await loading;
    expect(store.getState().recentDirectories).toEqual([entry('/b')]);
  });

  it('keeps the app-known list when the Host cannot answer', async () => {
    const { store, recents } = setup();
    const shown = [entry('/a')];
    Object.assign(recents, { quick: () => shown });
    await store.loadRecentDirectories();
    expect(store.getState().recentDirectories).toEqual(shown);
  });
});
