import {
  type DirectoryListing,
  FakeNewAgentEnvironment,
  FakeRecentDirectories,
  MemoryStorage,
  StoredRecentWorkspaces,
  worktreeIdentity,
  worktreeRemovalRequest,
} from '@openagentspocket/core';
import type { NewAgentServices } from './services';

const TREE: Readonly<Record<string, readonly string[]>> = {
  '/home/demo': ['projects', 'notes', 'work'],
  '/home/demo/projects': ['api-server', 'mobile', 'docs'],
  '/home/demo/work': [],
};

const listing = (path: string): DirectoryListing => ({
  directories: TREE[path] ?? [],
  symbolicLinks: new Set(),
  truncated: false,
});

const CHECKOUT = {
  repoKey: '/home/demo/projects/mobile/.git',
  repoName: 'mobile',
  repoRoot: '/home/demo/projects/mobile',
  checkoutPath: '/home/demo/projects/mobile-wt',
  isLinkedWorktree: true,
};

/** An offline Host for previews and tests until the live services are provided. */
export function createDemoServices(): NewAgentServices {
  const environment = new FakeNewAgentEnvironment();
  environment.workspacesByHost.set('demo', [
    {
      id: 'w0',
      label: 'api-server',
      order: 0,
      checkoutPath: '/home/demo/projects/api-server',
      directory: '/home/demo/projects/api-server',
    },
    {
      id: 'w1',
      label: 'mobile',
      order: 1,
      checkoutPath: '/home/demo/projects/mobile',
      directory: '/home/demo/projects/mobile',
    },
  ]);
  environment.kinds = ['claude', 'codex', 'omp'];
  environment.home = '/home/demo';
  environment.startResult = { paneId: 'p9', workspaceId: 'w0' };
  const recentDirectories = new FakeRecentDirectories([
    {
      path: '/home/demo/projects/api-server',
      displayPath: '~/projects/api-server',
      name: 'api-server',
    },
  ]);
  return {
    hosts: [{ id: 'demo', name: 'Demo Host' }],
    environment,
    recentWorkspaces: new StoredRecentWorkspaces(new MemoryStorage()),
    recentDirectories,
    directoryLister: () => ({
      resolveHome: async () => '/home/demo',
      list: async (path) => listing(path),
    }),
    worktreeDetail: (hostId, paneId) => {
      if (hostId !== 'demo' || paneId !== 'p4') return undefined;
      return {
        request: worktreeRemovalRequest(worktreeIdentity('demo', 'w3', CHECKOUT)),
        workspaceLabel: 'mobile-wt',
        checkout: CHECKOUT,
        sessionName: '',
        list: async () => ({
          repoKey: CHECKOUT.repoKey,
          worktrees: [
            {
              path: CHECKOUT.checkoutPath,
              branch: 'worktree/settings',
              isDetached: false,
              isLinkedWorktree: true,
              openWorkspaceId: 'w3',
            },
          ],
        }),
        remove: async (request) => ({ request, affectedAgentKeys: new Set() }),
        hasWorkingAgent: () => false,
      };
    },
  };
}
