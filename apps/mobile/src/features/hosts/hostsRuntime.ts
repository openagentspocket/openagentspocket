import {
  HostCatalog,
  type HostKeyPolicy,
  KnownHostsStore,
  MemorySecretStore,
  MemoryStorage,
  type PairingConnector,
  type PairingDeviceKeyLoad,
  PairingScanStore,
} from '@openagentspocket/core';
import { isDemoMode } from '@/connections/mode';
import { newUuid } from '@/connections/uuid';
import { DemoHostProbe, type HostProbe } from './HostProbe';
import { HostsModel } from './HostsModel';
import { DemoPairingConnector, demoDeviceKey, ModelPairingCatalog } from './pairingAdapters';

/** Everything the Hosts screens talk to; tests and the live transport swap the parts. */
export interface HostsRuntime {
  readonly model: HostsModel;
  readonly probe: HostProbe;
  readonly connector: PairingConnector;
  readonly loadDeviceKey: () => Promise<PairingDeviceKeyLoad>;
  /** Milliseconds the Trust this Host? prompt waits before it counts as declined. */
  readonly trustTimeoutMs: number;
  /** The Trust this Host? prompt shared with the live connections; absent in demo mode. */
  readonly confirmFirstConnect?: HostKeyPolicy['confirmFirstConnect'];
  /** Tells the live connections a Host passed its checks (or trusted a new key): redial it. */
  readonly reconnect?: (hostId: string) => Promise<void>;
  /** A fresh scan store per pairing screen. */
  createScanStore(): PairingScanStore;
}

export function createDemoRuntime(overrides: Partial<HostsRuntime> = {}): HostsRuntime {
  const model =
    overrides.model ??
    new HostsModel(
      new HostCatalog(new MemoryStorage(), new MemorySecretStore()),
      new KnownHostsStore(new MemoryStorage()),
      newUuid,
    );
  const connector = overrides.connector ?? new DemoPairingConnector();
  const loadDeviceKey =
    overrides.loadDeviceKey ??
    (async (): Promise<PairingDeviceKeyLoad> => ({ ok: true, key: demoDeviceKey }));
  return {
    model,
    probe: overrides.probe ?? new DemoHostProbe(),
    connector,
    loadDeviceKey,
    reconnect: overrides.reconnect,
    confirmFirstConnect: overrides.confirmFirstConnect,
    trustTimeoutMs: overrides.trustTimeoutMs ?? 60_000,
    createScanStore: () =>
      new PairingScanStore({
        connector,
        catalog: new ModelPairingCatalog(model),
        loadDeviceKey,
      }),
  };
}

let current: HostsRuntime | null = null;
let liveFactory: (() => HostsRuntime) | null = null;

/** The app root registers the persisted, SSH-backed runtime; demo mode and tests skip it. */
export function registerLiveRuntime(factory: (() => HostsRuntime) | null): void {
  liveFactory = factory;
}

export function hostsRuntime(): HostsRuntime {
  const live = isDemoMode() ? null : (liveFactory?.() ?? null);
  current ??= live ?? createDemoRuntime();
  return current;
}

/** Replaces the runtime (tests). */
export function setHostsRuntime(runtime: HostsRuntime | null): void {
  current = runtime;
}

/** The TOFU policy of a preflight run: the screen's prompt decides first connects. */
export function policyFor(
  model: HostsModel,
  confirmFirstConnect: HostKeyPolicy['confirmFirstConnect'],
): HostKeyPolicy {
  return { knownHosts: model.knownHosts, confirmFirstConnect };
}
