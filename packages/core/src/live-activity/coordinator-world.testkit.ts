import type { AgentInfo } from '../console/agent-fields';
import type { ConsoleRow } from '../console/row';
import type { EventsSessionStatus } from '../events/types';
import { FakeClock } from '../hosts/cancellation';
import { MemoryStorage } from '../hosts/known-hosts';
import { NotificationRegistrationCeremony } from '../notifications/ceremony';
import { FakeNotificationTransport, makeHost } from '../notifications/fake-notification-transport';
import { MemoryNotificationKeyStore } from '../notifications/key-store';
import { apnsToken, type PushDeviceToken } from '../notifications/push-token';
import { NotificationRegistrationFile } from '../notifications/registration-file';
import { HostLiveActivityCoordinator, SETTLE_MS } from './coordinator';
import { FakeLiveActivityController } from './fake-controller';
import { LiveActivityPreferences } from './preferences';
import type { ActivityAsk } from './types';

export const device = apnsToken('0a1b2c3d', 'sandbox');
export const connected: EventsSessionStatus = { kind: 'connected' };
export const PANE = 'wV:p1';
export const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

export function row(paneId: string, status: string, hostId = 'h1'): ConsoleRow {
  const agent = {
    pane_id: paneId,
    agent_status: status,
    agent: 'claude',
    terminal_title_stripped: 'Task',
    focused: false,
    revision: 0,
    tab_id: 't',
    terminal_id: 'x',
    workspace_id: 'w',
  } as AgentInfo;
  return { hostId, hostName: 'mbp', agent, workspaceTabCount: 1, tabPaneCount: 1 };
}

export interface World {
  readonly coordinator: HostLiveActivityCoordinator;
  readonly controller: FakeLiveActivityController;
  readonly transport: FakeNotificationTransport;
  readonly keys: MemoryNotificationKeyStore;
  readonly ceremony: NotificationRegistrationCeremony;
  readonly clock: FakeClock;
  readonly state: {
    hosts: ReturnType<typeof makeHost>[];
    awaiting: Set<string>;
    statuses: Map<string, EventsSessionStatus>;
    token: PushDeviceToken | null;
    pins: string[];
    asks: Map<string, ActivityAsk>;
    sending: boolean;
  };
  readonly host: ReturnType<typeof makeHost>;
  settle(): Promise<void>;
  liveToken(): string | undefined;
  livePins(): readonly string[] | undefined;
}

export async function makeWorld(
  options: { enabled?: boolean; register?: boolean } = {},
): Promise<World> {
  const host = makeHost('h1', { name: 'mbp' });
  const keys = new MemoryNotificationKeyStore();
  let counter = 0;
  const randomBytes = (length: number) => new Uint8Array(length).fill(++counter % 250);
  const ceremony = new NotificationRegistrationCeremony(keys, randomBytes);
  const transport = new FakeNotificationTransport();
  const controller = new FakeLiveActivityController();
  const clock = new FakeClock(flush);
  const state: World['state'] = {
    hosts: [host],
    awaiting: new Set(),
    statuses: new Map([[host.id, connected]]),
    token: device,
    pins: [],
    asks: new Map(),
    sending: false,
  };
  if (options.register !== false) await ceremony.register({ host, deviceToken: device, transport });
  const coordinator = new HostLiveActivityCoordinator({
    controller,
    preferences: new LiveActivityPreferences(new MemoryStorage()),
    transports: { withTransport: (_host, operation) => operation(transport) },
    keys,
    ceremony,
    clock,
    randomBytes,
    deviceToken: () => state.token,
    hosts: () => state.hosts,
    isAwaitingSnapshot: (id) => state.awaiting.has(id),
    connectionStatus: (id) => state.statuses.get(id),
    pinnedPaneIds: () => state.pins,
    approvalAsks: () => state.asks,
    isActionInFlight: () => state.sending,
    now: () => Date.UTC(2026, 10, 2, 12, 0, 0),
  });
  if (options.enabled !== false) coordinator.setEnabled(true, host.id);
  const owner = () => ceremony.registrationOwner(host, device);
  const live = () => {
    const o = owner();
    return o ? NotificationRegistrationFile.decode(transport.registration).liveActivity(o) : null;
  };
  return {
    coordinator,
    controller,
    transport,
    keys,
    ceremony,
    clock,
    state,
    host,
    settle: async () => {
      await clock.advance(SETTLE_MS);
      await coordinator.settled();
      await flush();
    },
    liveToken: () => live()?.token,
    livePins: () => live()?.pinnedPaneIds,
  };
}

export async function started(world: World, rows = [row(PANE, 'working')]): Promise<string> {
  await world.coordinator.start();
  world.coordinator.agentsDidChange(rows);
  await world.settle();
  const id = world.controller.requestedHandles[0]?.id;
  if (!id) throw new Error('no activity started');
  return id;
}
