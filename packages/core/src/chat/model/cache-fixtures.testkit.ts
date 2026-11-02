// Shared fixtures for the file cache tests.

import { agentInfo } from '../../console/testing';
import { encodeUtf8 } from '../../events/utf8';
import { fingerprintFromDigest } from '../../hosts/fingerprint';
import { type Host, hostRoute } from '../../hosts/host';
import { hostTrustKey } from '../../hosts/host-key-policy';
import { KnownHostsStore } from '../../hosts/known-hosts';
import { cachedAgentFromRow, trustedHostKeysFrom } from './agent-directory';
import {
  type ChatCacheDocument,
  type ChatCacheKey,
  cacheStorageName,
  DEFAULT_CACHE_POLICY,
  makeCacheDocument,
} from './cache';
import { MemoryCacheFileStore } from './cache-files';
import { FileChatTranscriptCache, hostDirectoryName } from './file-cache';
import type { ChatEntry } from './types';

export const HOST_A = '6f1d5c2a-0000-4000-8000-00000000000a';
export const HOST_B = '6f1d5c2a-0000-4000-8000-00000000000b';
export const DAY = 86_400_000;
export const SESSION = 'e951205e-24af-4a5e-baa7-3ccbebd2de2c';

export const keyFor = (hostID = HOST_A, conversationID = SESSION): ChatCacheKey => ({
  hostID,
  herdrSession: '',
  program: 'claude',
  conversationID,
});

export const entry = (index: number, text: string): ChatEntry => ({
  id: `e${index}`,
  sourceOffset: index * 100,
  content: { type: 'assistant', value: { text: `${text} ${index}` } },
});

export function documentFor(key: ChatCacheKey, count = 3, text = 'hello'): ChatCacheDocument {
  return makeCacheDocument({
    key,
    adapterRevision: 1,
    transcriptPath: '/home/dev/.claude/projects/-k/s.jsonl',
    head: encodeUtf8('{"type":"mode"}'),
    coverageStart: 0,
    coverageEnd: count * 100,
    reachedStart: true,
    title: 'Fix the build',
    entries: Array.from({ length: count }, (_, index) => entry(index, text)),
    savedAt: '2026-11-02T00:00:00.000Z',
  });
}

export function host(id = HOST_A, fields: Partial<Host> = {}): Host {
  return {
    id,
    name: '',
    username: 'dev',
    authMethod: 'deviceKey',
    sessionName: '',
    herdrEndpoint: null,
    routes: [hostRoute({ id: 'r1', address: 'host.example' })],
    ...fields,
  };
}

export function withRoute(base: Host, fields: Partial<Host['routes'][0]>): Host {
  const [first, ...rest] = base.routes;
  return { ...base, routes: [{ ...first, ...fields }, ...rest] };
}

export function cachedAgent(forHost: Host, sessionID = SESSION) {
  return cachedAgentFromRow({
    hostId: forHost.id,
    hostName: 'Host',
    agent: agentInfo('pane-1', 'working', {
      terminal_id: 'terminal-1',
      name: 'Worker',
      title: 'Implement caching',
      terminal_title: 'Chat',
      agent_session: { agent: 'claude', kind: 'id', source: 'herdr:claude', value: sessionID },
      tokens: { context: '1000' },
      state_labels: { working: 'Busy' },
      state_change_seq: 42,
      foreground_cwd: '/home/dev/project/src',
      cwd: '/home/dev/project',
    }),
    workspaceLabel: 'Project',
    tabLabel: 'Work',
    paneLabel: 'Worker pane',
    tabPosition: 2,
    workspaceTabCount: 3,
    tabPaneCount: 1,
    snapshotOrder: 1,
  });
}

export function fixture(policy = DEFAULT_CACHE_POLICY) {
  const clock = { now: 1_791_266_400_000 };
  const files = new MemoryCacheFileStore(() => clock.now);
  const knownHosts = new KnownHostsStore();
  const make = (store = files) =>
    new FileChatTranscriptCache(store, {
      root: '/cache',
      policy,
      now: () => clock.now,
      trustedHostKeys: trustedHostKeysFrom(knownHosts),
    });
  const path = (key: ChatCacheKey) =>
    `/cache/v1/${hostDirectoryName(key.hostID)}/${cacheStorageName(key)}.json`;
  return { clock, files, knownHosts, cache: make(), make, path };
}

export function trust(
  knownHosts: KnownHostsStore,
  hostID: string,
  byte: number,
  algorithm = 'ssh-ed25519',
) {
  const { host: name, port } = hostTrustKey(hostID);
  knownHosts.setFingerprint(
    fingerprintFromDigest(new Uint8Array(32).fill(byte), algorithm),
    name,
    port,
  );
}
