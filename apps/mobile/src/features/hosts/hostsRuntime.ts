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
  /** A fresh scan store per pairing screen. */
  createScanStore(): PairingScanStore;
}

let counter = 0;

/** Ids that are unique for the session; the persistence task swaps in UUIDs. */
function nextId(): string {
  counter += 1;
  return `host-${Date.now().toString(36)}-${counter}`;
}

export function createDemoRuntime(overrides: Partial<HostsRuntime> = {}): HostsRuntime {
  const knownHosts = new KnownHostsStore(new MemoryStorage());
  const catalog = new HostCatalog(new MemoryStorage(), new MemorySecretStore());
  const model = overrides.model ?? new HostsModel(catalog, knownHosts, nextId);
  const connector = overrides.connector ?? new DemoPairingConnector();
  const loadDeviceKey =
    overrides.loadDeviceKey ??
    (async (): Promise<PairingDeviceKeyLoad> => ({ ok: true, key: demoDeviceKey }));
  return {
    model,
    probe: overrides.probe ?? new DemoHostProbe(),
    connector,
    loadDeviceKey,
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

export function hostsRuntime(): HostsRuntime {
  current ??= createDemoRuntime();
  return current;
}

/** Replaces the runtime (tests, and the live transport once it exists). */
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
