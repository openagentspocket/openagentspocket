import {
  ApprovalLedger,
  apnsToken,
  approvalAsksSource,
  FakeClock,
  FakeLiveActivityController,
  FIRST_ASK_READ_MS,
  type Host,
  MemoryNotificationKeyStore,
  MemoryStorage,
  NotificationRegistrationCeremony,
  openActivity,
  parseApprovalAskReading,
  SETTLE_MS,
  StoredApprovalOptIns,
} from '@openagentspocket/core';
import { waitFor } from '@testing-library/react-native';
import { createWorld, SAMPLE_HOST, type World } from '@/connections/testWorld';
import { type ApprovalHost, type LiveActivityApprovals, LiveActivityRuntime } from './runtime';

jest.mock('expo-secure-store', () => ({}));
jest.mock('expo-sqlite/kv-store', () => ({}));

const noApprovals = (storage: MemoryStorage): LiveActivityApprovals => ({
  optIns: new StoredApprovalOptIns(storage),
  ledger: new ApprovalLedger(storage),
  host: {
    source: async () => null,
    run: () => Promise.reject(new Error('no read expected')),
    readAsks: () => Promise.reject(new Error('no read expected')),
    apply: () => Promise.reject(new Error('no apply expected')),
  },
  confirmOwner: async () => false,
});

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
    approvals: noApprovals(storage),
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

  describe('Approve and Deny', () => {
    const HOST: Host = { ...SAMPLE_HOST, id: 'h1' };
    const PANE = 'w1:p1';
    const BID = 'abcdefghijk';
    const REPORT = JSON.stringify({
      v: 1,
      result: 'ok',
      asks: [{ pane: PANE, bid: BID, ts: 1_000, act: 1, q: 'Run ls?', opts: ['Yes', 'No'] }],
    });
    const NOW_SECONDS = 1_060;

    function blockedWorld({ host = HOST, optedIn = true, confirms = true } = {}) {
      jest.spyOn(Date, 'now').mockReturnValue(NOW_SECONDS * 1000);
      const row = {
        hostId: host.id,
        hostName: 'mbp',
        workspaceTabCount: 1,
        tabPaneCount: 1,
        agent: { pane_id: PANE, agent_status: 'blocked', agent: 'claude' },
      };
      const summary = { id: host.id, isAwaitingSnapshot: false, status: { kind: 'connected' } };
      const store = {
        getState: () => ({ rows: [row], hosts: [summary] }),
        subscribe: () => () => undefined,
        pinnedPaneIds: () => [],
      };
      const clock = new FakeClock();
      const storage = new MemoryStorage();
      const keys = new MemoryNotificationKeyStore();
      const key = new Uint8Array(32).fill(3);
      keys.save({ hostId: host.id, hostName: 'mbp', key });
      const optIns = new StoredApprovalOptIns(storage);
      optIns.setEnabled(optedIn, host.id);
      const reads = jest.fn(async () => parseApprovalAskReading(REPORT));
      const apply = jest.fn<ReturnType<ApprovalHost['apply']>, Parameters<ApprovalHost['apply']>>(
        async () => 'sent',
      );
      const run = jest.fn(async () => REPORT);
      const confirmOwner = jest.fn(async () => confirms);
      const controller = new FakeLiveActivityController();
      const runtime = new LiveActivityRuntime({
        store: store as never,
        hosts: { getSnapshot: () => ({ hosts: [host] }), subscribe: () => () => undefined },
        controller,
        storage,
        transports: { withTransport: () => Promise.reject(new Error('no write expected')) },
        keys,
        ceremony: new NotificationRegistrationCeremony(keys, (n) => new Uint8Array(n)),
        clock,
        randomBytes: (n) => new Uint8Array(n).fill(1),
        deviceToken: () => apnsToken('ab12', 'sandbox'),
        approvals: {
          optIns,
          ledger: new ApprovalLedger(storage),
          confirmOwner,
          host: {
            source: async () => approvalAsksSource('/plugin', null),
            run,
            readAsks: reads,
            apply,
          },
        },
      });
      const shownAsk = () => {
        const content = controller.updates.at(-1)?.content ?? controller.requested.at(-1);
        if (!content?.envelope) return undefined;
        return openActivity({ ...content.envelope } as never, key).agents[0]?.ask;
      };
      return { runtime, clock, controller, reads, run, apply, confirmOwner, shownAsk };
    }

    afterEach(() => jest.restoreAllMocks());

    const showAsk = async (world: ReturnType<typeof blockedWorld>) => {
      world.runtime.start();
      world.runtime.setEnabled(true, HOST.id);
      await world.clock.advance(SETTLE_MS + 1);
      await world.clock.advance(FIRST_ASK_READ_MS);
      await waitFor(() => expect(world.run).toHaveBeenCalled());
      await world.clock.advance(SETTLE_MS + 1);
      await waitFor(() => expect(world.shownAsk()?.episodeId).toBe(BID));
    };

    it('shows the ask it read from the Host while the Agent is Blocked', async () => {
      const world = blockedWorld();
      await showAsk(world);
      await world.runtime.stop();
    });

    it('reads nothing for a Host that does not approve from outside the app', async () => {
      const world = blockedWorld({ optedIn: false });
      world.runtime.start();
      world.runtime.setEnabled(true, HOST.id);
      await world.clock.advance(FIRST_ASK_READ_MS + 1);
      expect(world.run).not.toHaveBeenCalled();
      await world.runtime.stop();
    });

    it('reads nothing for a named session it has no socket for', async () => {
      const host = { ...HOST, sessionName: 'work' };
      const world = blockedWorld({ host });
      world.runtime.start();
      world.runtime.setEnabled(true, host.id);
      await world.clock.advance(FIRST_ASK_READ_MS + 1);
      expect(world.run).not.toHaveBeenCalled();
      await world.runtime.stop();
    });

    const LINK = { hostId: HOST.id, paneId: PANE, episodeId: BID };
    const SHOWN = { prompt: 'Run ls?', options: ['Yes', 'No'] };

    it('a link alone reads the Host: it never asks for Face ID and never applies', async () => {
      const world = blockedWorld();
      await showAsk(world);
      expect(await world.runtime.review(LINK)).toMatchObject({
        kind: 'ask',
        ask: SHOWN,
        approve: 'Yes',
        deny: 'No',
      });
      expect(world.reads).toHaveBeenCalledTimes(1);
      expect(world.confirmOwner).not.toHaveBeenCalled();
      expect(world.apply).not.toHaveBeenCalled();
      expect(world.shownAsk()?.result).toBeUndefined();
      await world.runtime.stop();
    });

    it('a link with a stale episode has nothing to answer', async () => {
      const world = blockedWorld();
      await showAsk(world);
      expect(await world.runtime.review({ ...LINK, episodeId: 'zzzzzzzzzzz' })).toMatchObject({
        kind: 'nothing',
        outcome: 'promptChanged',
      });
      await world.runtime.stop();
    });

    it('a tap reads the Host again, asks the owner, applies and shows the result', async () => {
      const world = blockedWorld();
      await showAsk(world);
      const tap = { ...LINK, decision: 'approve', shown: SHOWN } as const;
      expect((await world.runtime.answer(tap))?.outcome).toBe('answered');
      expect(world.reads).toHaveBeenCalledTimes(1);
      expect(world.confirmOwner).toHaveBeenCalledTimes(1);
      expect(world.apply).toHaveBeenCalledWith(
        HOST.id,
        expect.objectContaining({ decision: 'approve', label: 'Yes', option: 1 }),
      );
      expect(world.shownAsk()?.result).toBe('sent');
      await world.runtime.stop();
    });

    it('an owner who does not confirm sends nothing', async () => {
      const world = blockedWorld({ confirms: false });
      await showAsk(world);
      const tap = { ...LINK, decision: 'approve', shown: SHOWN } as const;
      expect((await world.runtime.answer(tap))?.outcome).toBe('notAuthenticated');
      expect(world.apply).not.toHaveBeenCalled();
      await world.runtime.stop();
    });

    it('a link for a Host with the toggles off sends nothing', async () => {
      const world = blockedWorld({ optedIn: false });
      const tap = { ...LINK, decision: 'deny', shown: SHOWN } as const;
      expect((await world.runtime.answer(tap))?.outcome).toBe('optedOut');
      expect(world.reads).not.toHaveBeenCalled();
      expect(world.apply).not.toHaveBeenCalled();
    });
  });
});
