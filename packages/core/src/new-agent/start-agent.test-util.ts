import { MemoryStorage } from '../hosts/known-hosts';
import { FakeNewAgentEnvironment } from './fake-environment';
import { FakeRecentDirectories, type LaunchOrigin, StoredRecentWorkspaces } from './ports';
import { StartAgentStore } from './start-agent-store';

export const HOST = { id: 'h1', name: 'Box' };
export const WORKSPACES = [
  { id: 'w1', label: 'App', order: 0, checkoutPath: '/work/app' },
  { id: 'w2', label: 'Site', order: 1 },
];

export function setup(
  options: { hosts?: (typeof HOST)[]; origin?: LaunchOrigin; workspaces?: boolean } = {},
) {
  const environment = new FakeNewAgentEnvironment();
  if (options.workspaces !== false) environment.workspacesByHost.set('h1', WORKSPACES);
  const recents = new FakeRecentDirectories();
  const storage = new MemoryStorage();
  const store = new StartAgentStore({
    hosts: options.hosts ?? [HOST],
    environment,
    origin: options.origin,
    recentWorkspaces: new StoredRecentWorkspaces(storage),
    recentDirectories: recents,
  });
  return { store, environment, recents, storage };
}

export async function ready(options?: Parameters<typeof setup>[0]) {
  const context = setup(options);
  await context.store.discoverAgents();
  return context;
}
