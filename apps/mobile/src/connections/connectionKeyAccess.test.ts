import {
  FakeClock,
  KEY_ACCESS_REUSE_MS,
  KeyAccessGate,
  type KeyAccessResult,
} from '@openagentspocket/core';
import { waitFor } from '@testing-library/react-native';
import { BACKGROUND_GRACE_MS } from './ConnectionManager';
import { createWorld, HOST_KEY, SAMPLE_HOST, type World } from './testWorld';

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

/** Past the grace and back, the trip that used to turn a failed Host into a suspended one. */
async function longTripAway(world: World) {
  await world.manager.setActive(false);
  await world.clock.advance(BACKGROUND_GRACE_MS);
  await world.manager.setActive(true);
  await world.clock.advance(RECONNECT_WAIT_MS);
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

describe('the key gate on connections', () => {
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

  it('tries again on return when the system took the prompt away', async () => {
    const { world, gate } = await gatedWorld();
    gate.answer = 'interrupted';
    world.manager.start();
    await world.runtime.model.add(SAMPLE_HOST, null);
    await untilStatus(world, 'failed');

    gate.answer = 'success';
    await world.manager.setActive(false);
    await world.manager.setActive(true);
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

  it('keeps a refusal failed past the grace, on every return, until Retry', async () => {
    const { world, gate } = await gatedWorld();
    gate.answer = 'cancelled';
    world.manager.start();
    await world.runtime.model.add(SAMPLE_HOST, null);
    await untilStatus(world, 'failed');
    const seen = new Set<string | undefined>();
    const unsubscribe = world.store.subscribe(() => seen.add(statusOf(world)));

    await longTripAway(world);
    await longTripAway(world);
    await world.clock.advance(0);
    expect(gate.asked).toBe(1);
    expect(statusOf(world)).toBe('failed');
    expect([...seen].filter((kind) => kind !== 'failed')).toEqual([]);
    const summary = world.store.getState().hosts.find((host) => host.id === SAMPLE_HOST.id);
    expect(summary?.status).toMatchObject({ failure: { kind: 'keyAccessNotConfirmed' } });
    expect(world.runtime.model.connection(SAMPLE_HOST.id)).toBe('cantConnect');
    unsubscribe();

    await world.manager.reconnect(SAMPLE_HOST.id);
    await untilStatus(world, 'failed');
    expect(gate.asked).toBe(2);
    await longTripAway(world);
    expect(gate.asked).toBe(2);

    gate.answer = 'success';
    await world.manager.reconnect(SAMPLE_HOST.id);
    await untilStatus(world, 'connected');
    expect(gate.asked).toBe(3);
    world.manager.stop();
  });

  it('a refused Host the owner stopped asks nothing on the return', async () => {
    const { world, gate } = await gatedWorld();
    gate.answer = 'cancelled';
    world.manager.start();
    await world.runtime.model.add(SAMPLE_HOST, null);
    await untilStatus(world, 'failed');

    await world.store.stopConnecting(SAMPLE_HOST.id);
    await untilStatus(world, 'suspended');
    await longTripAway(world);
    await untilStatus(world, 'failed');
    expect(gate.asked).toBe(1);
    world.manager.stop();
  });

  it('an interrupted prompt still asks on a return past the grace', async () => {
    const { world, gate } = await gatedWorld();
    gate.answer = 'interrupted';
    world.manager.start();
    await world.runtime.model.add(SAMPLE_HOST, null);
    await untilStatus(world, 'failed');

    gate.answer = 'success';
    await longTripAway(world);
    await untilStatus(world, 'connected');
    expect(gate.asked).toBe(2);
    world.manager.stop();
  });

  it('a removed Host forgets its refusal', async () => {
    const { world, gate } = await gatedWorld();
    gate.answer = 'cancelled';
    world.manager.start();
    await world.runtime.model.add(SAMPLE_HOST, null);
    await untilStatus(world, 'failed');

    await world.runtime.model.remove(SAMPLE_HOST.id);
    gate.answer = 'success';
    await world.runtime.model.add(SAMPLE_HOST, null);
    await untilStatus(world, 'connected');
    expect(gate.asked).toBe(2);
    world.manager.stop();
  });

  it('a refusal that lands after the removal is not kept', async () => {
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

    await world.runtime.model.remove(SAMPLE_HOST.id);
    answers[0]?.('cancelled');
    await world.clock.advance(0);
    await world.runtime.model.add(SAMPLE_HOST, null);
    await waitFor(() => expect(answers).toHaveLength(2));
    answers[1]?.('success');
    await untilStatus(world, 'connected');
    world.manager.stop();
  });

  it('a refused side connection leaves the connected Host out of it', async () => {
    const { world, gate, gateClock } = await gatedWorld();
    world.manager.start();
    await world.runtime.model.add(SAMPLE_HOST, null);
    await untilStatus(world, 'connected');

    await gateClock.advance(KEY_ACCESS_REUSE_MS);
    gate.answer = 'cancelled';
    await expect(world.manager.connectDedicated(SAMPLE_HOST.id)).rejects.toBeDefined();
    gate.answer = 'success';

    await world.manager.setActive(false);
    await world.clock.advance(BACKGROUND_GRACE_MS);
    await untilStatus(world, 'suspended');
    await world.manager.setActive(true);
    await untilStatus(world, 'connected');
    world.manager.stop();
  });

  it('asks nothing for a Host that logs in with a password', async () => {
    const world = await createWorld(HOST_KEY, { keyAccess: refusingGate() });
    world.manager.start();
    await world.runtime.model.add({ ...SAMPLE_HOST, authMethod: 'password' }, 'secret');

    await waitFor(() => expect(world.ssh.sessions.length).toBeGreaterThan(0));
    world.manager.stop();
  });
});
