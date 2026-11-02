import {
  apnsToken,
  FakeLiveActivityController,
  MemoryNotificationKeyStore,
  MemoryStorage,
  NotificationRegistrationCeremony,
  SETTLE_MS,
} from '@openagentspocket/core';
import { waitFor } from '@testing-library/react-native';
import { createWorld, SAMPLE_HOST, type World } from '@/connections/testWorld';
import { LiveActivityRuntime } from './runtime';

jest.mock('expo-secure-store', () => ({}));
jest.mock('expo-sqlite/kv-store', () => ({}));

function makeRuntime(
  world: World,
  controller: FakeLiveActivityController,
  storage = new MemoryStorage(),
  withToken = false,
) {
  const keys = new MemoryNotificationKeyStore();
  if (withToken) {
    keys.save({
      hostId: SAMPLE_HOST.id,
      hostName: SAMPLE_HOST.name,
      key: new Uint8Array(32).fill(3),
    });
  }
  return new LiveActivityRuntime({
    store: world.store,
    hosts: world.runtime.model,
    controller,
    storage,
    transports: {
      withTransport: () => Promise.reject(new Error('no registration expected')),
    },
    keys,
    ceremony: new NotificationRegistrationCeremony(keys, (n) => new Uint8Array(n)),
    clock: world.clock,
    randomBytes: (n) => new Uint8Array(n),
    deviceToken: () => (withToken ? apnsToken('ab12', 'sandbox') : null),
  });
}

async function connectedWorld() {
  const world = await createWorld();
  world.manager.start();
  await world.runtime.model.add(SAMPLE_HOST, null);
  await waitFor(() => {
    world.acknowledgeEvents();
    expect(world.store.getState().rows).toHaveLength(1);
  });
  return world;
}

jest.setTimeout(30000);

describe('LiveActivityRuntime', () => {
  it('starts one activity for an opted-in Host from its Console rows, and ends it on opt-out', async () => {
    const world = await connectedWorld();
    const controller = new FakeLiveActivityController();
    const runtime = makeRuntime(world, controller, new MemoryStorage(), true);
    runtime.start();
    runtime.setEnabled(true, SAMPLE_HOST.id);
    world.clock.advance(SETTLE_MS + 1);
    await waitFor(() => expect(controller.requested).toHaveLength(1));
    runtime.setEnabled(false, SAMPLE_HOST.id);
    await waitFor(() => expect(controller.ended).toHaveLength(1));
    await runtime.stop();
  });

  it('does not start an activity for a Host that never opted in', async () => {
    const world = await connectedWorld();
    const controller = new FakeLiveActivityController();
    const runtime = makeRuntime(world, controller, new MemoryStorage(), true);
    runtime.start();
    world.clock.advance(SETTLE_MS + 1);
    await runtime.foreground();
    expect(controller.requested).toHaveLength(0);
    await runtime.stop();
  });

  it('keeps the per-Host toggle across restarts', async () => {
    const world = await connectedWorld();
    const storage = new MemoryStorage();
    const first = makeRuntime(world, new FakeLiveActivityController(), storage);
    first.setEnabled(true, SAMPLE_HOST.id);
    const second = makeRuntime(world, new FakeLiveActivityController(), storage);
    expect(second.isEnabled(SAMPLE_HOST.id)).toBe(true);
    expect(second.isEnabled('other')).toBe(false);
  });

  it('ends activities of unknown Hosts at launch and keeps known ones', async () => {
    const world = await connectedWorld();
    const controller = new FakeLiveActivityController();
    controller.seed('a-known', SAMPLE_HOST.id);
    controller.seed('a-gone', 'removed-host');
    const runtime = makeRuntime(world, controller);
    runtime.start();
    await runtime.foreground();
    await waitFor(() =>
      expect(new Set(controller.ended.map((e) => e.id))).toEqual(new Set(['a-gone'])),
    );
    await runtime.stop();
  });
});
