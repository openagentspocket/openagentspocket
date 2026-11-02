import { hostTrustKey } from '@openagentspocket/core';
import { waitFor } from '@testing-library/react-native';
import { createWorld, HOST_KEY, OTHER_KEY, SAMPLE_HOST, type World } from './testWorld';

jest.mock('expo-secure-store', () => ({}));
jest.mock('expo-sqlite/kv-store', () => ({}));

function statusOf(world: World): string | undefined {
  return world.store.getState().hosts.find((host) => host.id === SAMPLE_HOST.id)?.status?.kind;
}

async function untilStatus(world: World, kind: string) {
  await waitFor(() => {
    world.acknowledgeEvents();
    expect(statusOf(world)).toBe(kind);
  });
}

describe('connection manager', () => {
  it('connects a saved Host after the trust decision and shows its agents', async () => {
    const world = await createWorld();
    world.manager.start();
    await world.runtime.model.add(SAMPLE_HOST, null);
    await untilStatus(world, 'connected');
    expect(world.prompts.count).toBe(1);
    await waitFor(() => {
      expect(world.store.getState().rows.map((row) => row.agent.pane_id)).toEqual(['p1']);
    });
    expect(world.runtime.model.connection(SAMPLE_HOST.id)).toBe('connected');
    const key = hostTrustKey(SAMPLE_HOST.id);
    expect(world.deps.knownHosts.fingerprints(key.host, key.port)).toHaveLength(1);
    world.manager.stop();
  });

  it('stops at the host-key decision when the user declines, pinning nothing', async () => {
    const world = await createWorld();
    world.prompts.answer = false;
    world.manager.start();
    await world.runtime.model.add(SAMPLE_HOST, null);
    await untilStatus(world, 'failed');
    expect(world.runtime.model.connection(SAMPLE_HOST.id)).toBe('cantConnect');
    const key = hostTrustKey(SAMPLE_HOST.id);
    expect(world.deps.knownHosts.fingerprints(key.host, key.port)).toHaveLength(0);
    expect(world.ssh.sessions).toHaveLength(0);
    world.manager.stop();
  });

  it('suspends on background and resumes on foreground without asking again', async () => {
    const world = await createWorld();
    world.manager.start();
    await world.runtime.model.add(SAMPLE_HOST, null);
    await untilStatus(world, 'connected');

    await world.manager.setActive(false);
    await untilStatus(world, 'suspended');
    expect(world.runtime.model.connection(SAMPLE_HOST.id)).toBe('notConnected');

    await world.manager.setActive(true);
    await untilStatus(world, 'connected');
    expect(world.prompts.count).toBe(1);
    world.manager.stop();
  });

  it('does not dial while the app is in the background', async () => {
    const world = await createWorld();
    await world.manager.setActive(false);
    world.manager.start();
    await world.runtime.model.add(SAMPLE_HOST, null);
    await waitFor(() => expect(world.store.getState().hosts).toHaveLength(1));
    expect(world.ssh.sessions).toHaveLength(0);
    expect(world.prompts.count).toBe(0);
    world.manager.stop();
  });

  it('follows the catalog: removing a Host drops its connection', async () => {
    const world = await createWorld();
    world.manager.start();
    await world.runtime.model.add(SAMPLE_HOST, null);
    await untilStatus(world, 'connected');
    await world.runtime.model.remove(SAMPLE_HOST.id);
    expect(world.store.getState().hosts).toHaveLength(0);
    expect(world.manager.hostIds()).toEqual([]);
    world.manager.stop();
  });

  it('refuses a key that changed since it was trusted, without prompting', async () => {
    const world = await createWorld();
    world.manager.start();
    await world.runtime.model.add(SAMPLE_HOST, null);
    await untilStatus(world, 'connected');
    world.manager.stop();

    const other = await createWorld(OTHER_KEY);
    // Reuse the trusted pin from the first world on a server presenting another key.
    const key = hostTrustKey(SAMPLE_HOST.id);
    for (const fingerprint of world.deps.knownHosts.fingerprints(key.host, key.port)) {
      other.deps.knownHosts.setFingerprint(fingerprint, key.host, key.port);
    }
    other.manager.start();
    await other.runtime.model.add(SAMPLE_HOST, null);
    await untilStatus(other, 'failed');
    expect(other.prompts.count).toBe(0);
    expect(other.runtime.model.connection(SAMPLE_HOST.id)).toBe('cantConnect');
    other.manager.stop();
  });
});

describe('real preflight probe', () => {
  it('passes every check against a Host that answers', async () => {
    const world = await createWorld();
    const outcome = await world.runtime.probe.run(SAMPLE_HOST, {
      knownHosts: world.deps.knownHosts,
      confirmFirstConnect: async () => true,
    });
    expect(outcome.report.failure).toBeNull();
    expect(outcome.routeInUse).toBe('route-1');
  });

  it('reports a changed key with both fingerprints', async () => {
    const trusted = await createWorld();
    const policy = { knownHosts: trusted.deps.knownHosts, confirmFirstConnect: async () => true };
    await trusted.runtime.probe.run(SAMPLE_HOST, policy);

    const other = await createWorld(OTHER_KEY);
    const outcome = await other.runtime.probe.run(SAMPLE_HOST, policy);
    expect(outcome.report.failure?.check).toBe('connection');
    expect(outcome.report.failure?.hint.key).toBe('hostKeyChanged');
    expect(outcome.changedKey?.presented).not.toEqual(outcome.changedKey?.known);
    expect(HOST_KEY.fingerprint).not.toBe(OTHER_KEY.fingerprint);
  });

  it('stops at the connection check when the user declines the key', async () => {
    const world = await createWorld();
    const outcome = await world.runtime.probe.run(SAMPLE_HOST, {
      knownHosts: world.deps.knownHosts,
      confirmFirstConnect: async () => false,
    });
    expect(outcome.report.failure?.hint.key).toBe('hostKeyRejected');
  });
});
