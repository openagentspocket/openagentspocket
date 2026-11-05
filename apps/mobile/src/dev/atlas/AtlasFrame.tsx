import {
  AgentStatusClocks,
  type Host,
  hostRoute,
  type ListPresentation,
  MemoryStorage,
  PinnedAgents,
} from '@openagentspocket/core';
import { systemClock } from '@openagentspocket/transport';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { createDemoConsoleStore } from '@/console/demo';
import { ConsoleStoreProvider } from '@/console/hooks';
import { ConsoleStore } from '@/console/store';
import type { DemoHostProbe } from '@/features/hosts/HostProbe';
import { createDemoRuntime, policyFor, setHostsRuntime } from '@/features/hosts/hostsRuntime';
import { createDemoServices } from '@/features/new-agent/demo';
import { NewAgentServicesProvider } from '@/features/new-agent/services';
import { freezeAtlasClock } from './atlasClock';
import { offlineHostsStore } from './offlineHosts';

export interface AtlasData {
  /** `empty`: no Hosts at all (first run). Default `demo`: the scripted Hosts and Agents. */
  console?: 'demo' | 'empty' | 'offline';
  hosts?: 'demo' | 'empty';
  /** The Agents list grouping, for the list ids. Default flat. */
  presentation?: ListPresentation;
  /** `false`: the Hosts never connected, so the first preflight asks to trust the key. */
  trusted?: boolean;
  /** The plugin version every Host reports (an old one raises the plugin notice). */
  pluginVersion?: string;
  /** `unavailable`: this device's key cannot be loaded, so the form offers Replace Device Key. */
  deviceKey?: 'unavailable';
  /** `hostless`: several Hosts and none picked, as Swift opens New Agent / New Terminal. */
  newAgent?: 'hostless';
}

export const DEMO_HOSTS: readonly Host[] = [
  {
    id: 'demo',
    name: 'Demo Host',
    username: 'demo',
    authMethod: 'deviceKey',
    sessionName: '',
    herdrEndpoint: null,
    routes: [hostRoute({ id: 'r1', address: 'demo.example' })],
  },
  {
    id: 'lab',
    name: 'Lab',
    username: 'ada',
    authMethod: 'password',
    sessionName: '',
    herdrEndpoint: null,
    routes: [hostRoute({ id: 'r2', address: 'lab.example' })],
  },
];

function emptyConsoleStore(): ConsoleStore {
  return new ConsoleStore({
    pins: new PinnedAgents(new MemoryStorage()),
    clocks: new AgentStatusClocks(new MemoryStorage()),
    clock: systemClock,
  });
}

/**
 * Deterministic world for one atlas screen: the clock pinned, a fresh Console store, a fresh Hosts
 * runtime seeded with the demo Hosts, and the chosen theme. Renders nothing until seeded.
 */
export function AtlasFrame({ data, children }: { data: AtlasData; children: ReactNode }) {
  freezeAtlasClock();
  const [ready, setReady] = useState(false);
  const store = useMemo(() => {
    const created =
      data.console === 'empty'
        ? emptyConsoleStore()
        : data.console === 'offline'
          ? offlineHostsStore()
          : createDemoConsoleStore(undefined, undefined, true);
    if (data.presentation) created.listPrefs.setPresentation(data.presentation);
    return created;
  }, [data.console, data.presentation]);
  const hostless = useMemo(() => {
    if (data.newAgent !== 'hostless') return undefined;
    const demo = createDemoServices();
    return { ...demo, hosts: [...demo.hosts, { id: 'lab', name: 'Lab' }] };
  }, [data.newAgent]);
  useEffect(() => {
    let live = true;
    const runtime = createDemoRuntime(
      data.deviceKey === 'unavailable'
        ? {
            loadDeviceKey: async () => ({ ok: false, reason: 'unavailable' }),
            replaceDeviceKey: async () => undefined,
          }
        : {},
    );
    setHostsRuntime(runtime);
    const seed = data.hosts === 'empty' ? [] : DEMO_HOSTS;
    if (data.pluginVersion) {
      for (const host of seed)
        (runtime.probe as DemoHostProbe).setPluginVersion(host.id, data.pluginVersion);
    }
    const policy = policyFor(runtime.model, async () => true);
    void Promise.all(seed.map((host) => runtime.model.add(host, null)))
      // A trusted Host has its key pinned: its page opens straight to a passing preflight.
      .then(() =>
        data.trusted === false
          ? []
          : Promise.all(seed.map((host) => runtime.probe.run(host, policy))),
      )
      .then(() => {
        for (const host of seed) {
          runtime.model.setConnection(host.id, 'connected');
          runtime.model.setLatency(host.id, 0);
        }
        if (live) setReady(true);
      });
    return () => {
      live = false;
      setHostsRuntime(null);
    };
  }, [data.hosts, data.trusted, data.pluginVersion, data.deviceKey]);
  if (!ready) return null;
  const body = <ConsoleStoreProvider store={store}>{children}</ConsoleStoreProvider>;
  return hostless ? (
    <NewAgentServicesProvider services={hostless}>{body}</NewAgentServicesProvider>
  ) : (
    body
  );
}
