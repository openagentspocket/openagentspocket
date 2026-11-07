import {
  FakeClock,
  fingerprintFromDigest,
  hostTrustKey,
  KEY_ACCESS_REUSE_MS,
  KeyAccessGate,
  type KeyAccessResult,
} from '@openagentspocket/core';
import { waitFor } from '@testing-library/react-native';
import { BACKGROUND_GRACE_MS } from './ConnectionManager';
import { createWorld, HOST_KEY, OTHER_KEY, SAMPLE_HOST, type World } from './testWorld';
import { TrustPromptQueue } from './trustPrompt';

jest.mock('expo-secure-store', () => ({}));
jest.mock('expo-sqlite/kv-store', () => ({}));

/** Past the session's first backoff, inside the grace. */
const RECONNECT_WAIT_MS = BACKGROUND_GRACE_MS / 3;

function statusOf(world: World): string | undefined {
  return world.store.getState().hosts.find((host) => host.id === SAMPLE_HOST.id)?.status?.kind;
}

async function untilStatus(world: World, kind: string) {
  await waitFor(() => {
    world.acknowledgeEvents();
    expect(statusOf(world)).toBe(kind);
  });
}

function refusingGate(): KeyAccessGate {
  return new KeyAccessGate({
    isRequired: () => true,
    authenticate: async () => 'cancelled',
    clock: new FakeClock(),
  });
}

/** A world on a required gate that, like iOS, refuses a prompt the app has no window for. */
async function gatedWorld() {
  const gateClock = new FakeClock();
  const gate = { asked: 0, answer: 'success' as KeyAccessResult };
  const keyAccess = new KeyAccessGate({
    isRequired: () => true,
    authenticate: async () => {
      gate.asked += 1;
      return world.manager.isActive ? gate.answer : 'cancelled';
    },
    clock: gateClock,
  });
  const world: World = await createWorld(HOST_KEY, { keyAccess });
  return { world, gate, gateClock };
}

/** The app leaves, the confirmation runs out, the link drops and the session's redial comes up. */
async function dropWhileAway(world: World, gateClock: FakeClock) {
  await world.manager.setActive(false);
  await gateClock.advance(KEY_ACCESS_REUSE_MS);
  await world.ssh.sessions.at(-1)?.disconnect();
  await waitFor(() => {
    world.acknowledgeEvents();
    expect(statusOf(world)).toBe('reconnecting');
  });
  await world.clock.advance(RECONNECT_WAIT_MS);
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
    await world.clock.advance(BACKGROUND_GRACE_MS);
    await untilStatus(world, 'suspended');
    expect(world.runtime.model.connection(SAMPLE_HOST.id)).toBe('notConnected');

    await world.manager.setActive(true);
    await untilStatus(world, 'connected');
    expect(world.prompts.count).toBe(1);
    world.manager.stop();
  });

  it('resumes after a quick background and foreground without waiting for the suspend', async () => {
    const world = await createWorld();
    world.manager.start();
    await world.runtime.model.add(SAMPLE_HOST, null);
    await untilStatus(world, 'connected');

    const background = world.manager.setActive(false);
    const foreground = world.manager.setActive(true);
    await Promise.all([background, foreground]);
    await untilStatus(world, 'connected');
    expect(world.runtime.model.connection(SAMPLE_HOST.id)).toBe('connected');
    expect(world.prompts.count).toBe(1);
    world.manager.stop();
  });

  it('keeps the connection through a short trip away, Face ID included', async () => {
    const world = await createWorld();
    world.manager.start();
    await world.runtime.model.add(SAMPLE_HOST, null);
    await untilStatus(world, 'connected');
    const dialed = world.ssh.sessions.length;

    await world.manager.setActive(false);
    await world.clock.advance(BACKGROUND_GRACE_MS - 1);
    expect(statusOf(world)).toBe('connected');
    await world.manager.setActive(true);
    await world.clock.advance(BACKGROUND_GRACE_MS);

    await untilStatus(world, 'connected');
    expect(world.ssh.sessions).toHaveLength(dialed);
    world.manager.stop();
  });

  it('suspends at once when asked to, without the grace', async () => {
    const world = await createWorld();
    world.manager.start();
    await world.runtime.model.add(SAMPLE_HOST, null);
    await untilStatus(world, 'connected');

    await world.manager.setActive(false, { immediately: true });
    await untilStatus(world, 'suspended');
    world.manager.stop();
  });

  it('uses no key when the owner refuses, and says so', async () => {
    const world = await createWorld(HOST_KEY, { keyAccess: refusingGate() });
    world.manager.start();
    await world.runtime.model.add(SAMPLE_HOST, null);

    await untilStatus(world, 'failed');
    expect(world.ssh.sessions).toHaveLength(0);
    world.manager.stop();
  });

  it('waits for the return before asking for the key, then connects by itself', async () => {
    const { world, gate, gateClock } = await gatedWorld();
    world.manager.start();
    await world.runtime.model.add(SAMPLE_HOST, null);
    await untilStatus(world, 'connected');
    const dialed = world.ssh.sessions.length;

    await dropWhileAway(world, gateClock);
    expect(gate.asked).toBe(1);
    expect(statusOf(world)).not.toBe('failed');

    await world.manager.setActive(true);
    await untilStatus(world, 'connected');
    expect(gate.asked).toBe(2);
    expect(world.ssh.sessions).toHaveLength(dialed + 1);
    world.manager.stop();
  });

  it('asks nothing when the grace ends away, and once on the return', async () => {
    const { world, gate, gateClock } = await gatedWorld();
    world.manager.start();
    await world.runtime.model.add(SAMPLE_HOST, null);
    await untilStatus(world, 'connected');

    await dropWhileAway(world, gateClock);
    await world.clock.advance(BACKGROUND_GRACE_MS);
    await untilStatus(world, 'suspended');
    expect(gate.asked).toBe(1);

    await world.manager.setActive(true);
    await untilStatus(world, 'connected');
    expect(gate.asked).toBe(2);
    world.manager.stop();
  });

  it('keeps redialing away from the app while a confirmation still covers the key', async () => {
    const { world, gate } = await gatedWorld();
    world.manager.start();
    await world.runtime.model.add(SAMPLE_HOST, null);
    await untilStatus(world, 'connected');
    const dialed = world.ssh.sessions.length;

    await world.manager.setActive(false);
    await world.ssh.sessions.at(-1)?.disconnect();
    await waitFor(() => {
      world.acknowledgeEvents();
      expect(statusOf(world)).toBe('reconnecting');
    });
    await world.clock.advance(RECONNECT_WAIT_MS);
    await untilStatus(world, 'connected');
    expect(world.ssh.sessions).toHaveLength(dialed + 1);
    expect(gate.asked).toBe(1);
    world.manager.stop();
  });

  it('asks nothing for a Host removed while it waited for the return', async () => {
    const { world, gate, gateClock } = await gatedWorld();
    world.manager.start();
    await world.runtime.model.add(SAMPLE_HOST, null);
    await untilStatus(world, 'connected');

    await dropWhileAway(world, gateClock);
    await world.runtime.model.remove(SAMPLE_HOST.id);
    await world.manager.setActive(true);
    await world.clock.advance(0);
    expect(gate.asked).toBe(1);
    world.manager.stop();
  });

  it('asks again on the return when leaving cut the prompt short', async () => {
    const answers: ((result: KeyAccessResult) => void)[] = [];
    const keyAccess = new KeyAccessGate({
      isRequired: () => true,
      authenticate: () => new Promise((answer) => answers.push(answer)),
      clock: new FakeClock(),
    });
    const world = await createWorld(HOST_KEY, { keyAccess });
    world.manager.start();
    await world.runtime.model.add(SAMPLE_HOST, null);
    await waitFor(() => expect(answers).toHaveLength(1));

    await world.manager.setActive(false);
    answers[0]?.('cancelled');
    await world.clock.advance(0);
    expect(statusOf(world)).not.toBe('failed');

    await world.manager.setActive(true);
    await waitFor(() => expect(answers).toHaveLength(2));
    answers[1]?.('success');
    await untilStatus(world, 'connected');
    world.manager.stop();
  });

  it('keeps a refusal failed across a trip away, until Retry', async () => {
    const { world, gate } = await gatedWorld();
    gate.answer = 'cancelled';
    world.manager.start();
    await world.runtime.model.add(SAMPLE_HOST, null);
    await untilStatus(world, 'failed');
    expect(gate.asked).toBe(1);

    await world.manager.setActive(false);
    await world.manager.setActive(true);
    await world.clock.advance(RECONNECT_WAIT_MS);
    await untilStatus(world, 'failed');
    expect(gate.asked).toBe(1);

    gate.answer = 'success';
    await world.manager.reconnect(SAMPLE_HOST.id);
    await untilStatus(world, 'connected');
    expect(gate.asked).toBe(2);
    world.manager.stop();
  });

  it('asks nothing for a Host that logs in with a password', async () => {
    const world = await createWorld(HOST_KEY, { keyAccess: refusingGate() });
    world.manager.start();
    await world.runtime.model.add({ ...SAMPLE_HOST, authMethod: 'password' }, 'secret');

    await waitFor(() => expect(world.ssh.sessions.length).toBeGreaterThan(0));
    world.manager.stop();
  });

  it('names a Host without a name by its address in the Console', async () => {
    const world = await createWorld();
    world.manager.start();
    await world.runtime.model.add({ ...SAMPLE_HOST, name: '' }, null);
    await waitFor(() => {
      expect(world.store.getState().hosts.map((host) => host.name)).toEqual(['workshop.example']);
    });
    world.manager.stop();
  });

  it('shares one Trust prompt between the preflight and the connection', async () => {
    const world = await createWorld();
    let asked = 0;
    const queue = new TrustPromptQueue(async () => {
      asked += 1;
      return true;
    });
    const candidate = {
      host: 'workshop.example',
      port: 22,
      fingerprint: fingerprintFromDigest(
        Uint8Array.from({ length: 32 }, (_, i) => i),
        'ssh-ed25519',
      ),
    };
    const [first, second] = await Promise.all([queue.confirm(candidate), queue.confirm(candidate)]);
    expect([first, second, await queue.confirm(candidate)]).toEqual([true, true, true]);
    expect(asked).toBe(1);
    expect(world.runtime.confirmFirstConnect).toBeDefined();
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
