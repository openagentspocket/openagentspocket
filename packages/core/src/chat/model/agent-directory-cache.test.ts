import '../programs';
// The Agent directory's machine binding (Swift ChatTranscriptCacheTests, agent directory cases),
// on the file cache and the volatile one alike.

import { describe, expect, it } from 'vitest';
import { type Host, hostRoute } from '../../hosts/host';
import { KnownHostsStore } from '../../hosts/known-hosts';
import { consoleRowFromCached, trustedHostKeysFrom } from './agent-directory';
import {
  type ChatTranscriptCache,
  DEFAULT_CACHE_POLICY,
  VolatileChatTranscriptCache,
} from './cache';
import {
  cachedAgent,
  fixture,
  HOST_A,
  HOST_B,
  host,
  trust,
  withRoute,
} from './cache-fixtures.testkit';

type Variant = {
  name: string;
  make: () => { cache: ChatTranscriptCache; knownHosts: KnownHostsStore };
};

const variants: Variant[] = [
  {
    name: 'file',
    make: () => {
      const f = fixture();
      return { cache: f.cache, knownHosts: f.knownHosts };
    },
  },
  {
    name: 'volatile',
    make: () => {
      const knownHosts = new KnownHostsStore();
      return {
        cache: new VolatileChatTranscriptCache(trustedHostKeysFrom(knownHosts)),
        knownHosts,
      };
    },
  },
];

describe.each(variants)('Agent directory ($name cache)', ({ make }) => {
  it('without a host key, a changed primary route, account or session is another machine', async () => {
    const { cache } = make();
    const base = host();
    const cached = cachedAgent(base);
    await cache.saveAgentDirectory([cached], base);
    const changes: Host[] = [
      withRoute(base, { address: 'other.example' }),
      { ...base, sessionName: 'other' },
      withRoute(base, { port: 2222 }),
      { ...base, username: 'other' },
      withRoute(base, { jumpAddress: 'jump.example' }),
      withRoute(base, { jumpPort: 2222, jumpAddress: '' }),
      withRoute(base, { jumpUsername: 'jump-user' }),
    ];
    for (const changed of changes) expect(await cache.loadAgentDirectory(changed)).toEqual([]);
    const renamed = await cache.loadAgentDirectory({ ...base, name: 'Renamed Host' });
    expect(renamed).toEqual([cached]);
    expect(
      consoleRowFromCached(renamed[0] ?? cached, { ...base, name: 'Renamed Host' }).hostName,
    ).toBe('Renamed Host');
  });

  it('follows the herdr endpoint socket, not its launcher', async () => {
    const { cache } = make();
    const endpoint = (socketPath: string, executablePath: string) => ({
      socketPath,
      executablePath,
    });
    const base = host(HOST_A, {
      herdrEndpoint: endpoint('/opt/app/herdr/herdr.sock', '/opt/app/bin/herdr'),
    });
    const cached = cachedAgent(base);
    await cache.saveAgentDirectory([cached], base);
    const relaunched = {
      ...base,
      herdrEndpoint: endpoint('/opt/app/herdr/herdr.sock', '/opt/app2/bin/herdr'),
    };
    expect(await cache.loadAgentDirectory(relaunched)).toEqual([cached]);
    const moved = {
      ...base,
      herdrEndpoint: endpoint('/opt/other/herdr/herdr.sock', '/opt/app/bin/herdr'),
    };
    expect(await cache.loadAgentDirectory(moved)).toEqual([]);
    expect(await cache.loadAgentDirectory({ ...base, herdrEndpoint: null })).toEqual([]);
  });

  it('follows the trusted host key rather than the routes', async () => {
    const { cache, knownHosts } = make();
    const base = host();
    trust(knownHosts, base.id, 1);
    const cached = cachedAgent(base);
    await cache.saveAgentDirectory([cached], base);

    const [first, ...rest] = base.routes;
    const rerouted: Host = {
      ...base,
      routes: [
        hostRoute({ id: 'r0', address: '10.0.0.2', jumpAddress: 'jump.example' }),
        { ...first, address: 'elsewhere.example' },
        ...rest,
      ],
    };
    expect(await cache.loadAgentDirectory(rerouted)).toEqual([cached]);
    expect(await cache.loadAgentDirectory({ ...rerouted, sessionName: 'other' })).toEqual([]);
    expect(await cache.loadAgentDirectory({ ...rerouted, username: 'other' })).toEqual([]);
    const otherServer = {
      ...rerouted,
      herdrEndpoint: {
        socketPath: '/opt/app/herdr/herdr.sock',
        executablePath: '/opt/app/bin/herdr',
      },
    };
    expect(await cache.loadAgentDirectory(otherServer)).toEqual([]);

    trust(knownHosts, base.id, 2, 'rsa-sha2-512');
    expect(await cache.loadAgentDirectory(rerouted)).toEqual([cached]);
    expect(await cache.agentDirectoryBelongs(rerouted)).toBe(true);

    trust(knownHosts, base.id, 3);
    expect(await cache.loadAgentDirectory(base)).toEqual([]);
    expect(await cache.agentDirectoryBelongs(base)).toBe(false);
    expect(await cache.agentDirectoryBelongs(host(HOST_B))).toBe(true);
  });

  it('a directory saved without a key migrates on its primary route until the next save', async () => {
    const { cache, knownHosts } = make();
    const base = host();
    const cached = cachedAgent(base);
    await cache.saveAgentDirectory([cached], base);
    trust(knownHosts, base.id, 1);
    const rerouted = withRoute(base, { address: 'other.example' });
    expect(await cache.loadAgentDirectory(base)).toEqual([cached]);
    expect(await cache.loadAgentDirectory(rerouted)).toEqual([]);
    expect(await cache.agentDirectoryBelongs(rerouted)).toBe(false);
    await cache.saveAgentDirectory([cached], base);
    expect(await cache.loadAgentDirectory(rerouted)).toEqual([cached]);
  });

  it('is removed by clearing and by removing the Host, which also refuses late saves', async () => {
    const { cache } = make();
    const base = host();
    const cached = cachedAgent(base);
    await cache.saveAgentDirectory([cached], base);
    await cache.removeAll();
    expect(await cache.loadAgentDirectory(base)).toEqual([]);
    await cache.saveAgentDirectory([cached], base);
    expect(await cache.loadAgentDirectory(base)).toEqual([cached]);
    await cache.retainHosts(new Set([HOST_B]));
    expect(await cache.loadAgentDirectory(base)).toEqual([]);
    await cache.saveAgentDirectory([cached], base);
    expect(await cache.loadAgentDirectory(base)).toEqual([]);
  });

  it('rejects unbound and foreign agents, and an empty list deletes the directory', async () => {
    const { cache } = make();
    const base = host();
    const valid = cachedAgent(base);
    await cache.saveAgentDirectory(
      [valid, cachedAgent(base, '../invalid'), cachedAgent(host(HOST_B))],
      base,
    );
    expect(await cache.loadAgentDirectory(base)).toEqual([valid]);
    await cache.saveAgentDirectory([], base);
    expect(await cache.loadAgentDirectory(base)).toEqual([]);
  });
});

describe('Agent directory on disk', () => {
  it('survives a relaunch without restoring live status', async () => {
    const { files, make } = fixture();
    const base = host();
    const cached = cachedAgent(base);
    await make().saveAgentDirectory([cached], base);

    const reopened = make(files);
    const entries = await reopened.loadAgentDirectory(base);
    expect(entries).toEqual([cached]);
    const row = consoleRowFromCached(entries[0] ?? cached, base);
    expect(row.agent.pane_id).toBe('pane-1');
    expect(row.agent.agent_session).toEqual(cached.agentSession);
    expect(row.agent.agent_status).toBe('unknown');
    expect(row.agent.tokens).toBeUndefined();
    expect(row.agent.state_labels).toBeUndefined();
    expect(row.agent.state_change_seq).toBeUndefined();
    expect(row.agent.name).toBe('Worker');
    expect(row.agent.title).toBe('Implement caching');
    expect(row.agent.foreground_cwd).toBe('/home/dev/project/src');
    expect([row.workspaceLabel, row.tabLabel, row.paneLabel, row.tabPosition]).toEqual([
      'Project',
      'Work',
      'Worker pane',
      2,
    ]);
  });

  it('counts toward usage and expires with the age limit', async () => {
    const { cache, clock } = fixture({ ...DEFAULT_CACHE_POLICY, maxAgeMilliseconds: 60_000 });
    const base = host();
    await cache.saveAgentDirectory([cachedAgent(base)], base);
    expect(await cache.diskUsage()).toBeGreaterThan(0);
    clock.now += 120_000;
    await cache.prune();
    expect(await cache.loadAgentDirectory(base)).toEqual([]);
    expect(await cache.diskUsage()).toBe(0);
  });

  it('respects the total budget', async () => {
    const { cache } = fixture({ ...DEFAULT_CACHE_POLICY, totalBudget: 1, lowWater: 0 });
    const base = host();
    await cache.saveAgentDirectory([cachedAgent(base)], base);
    expect(await cache.diskUsage()).toBe(0);
    expect(await cache.loadAgentDirectory(base)).toEqual([]);
  });
});
