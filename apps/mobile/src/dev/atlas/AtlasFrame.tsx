import {
  AgentStatusClocks,
  type Host,
  hostRoute,
  MemoryStorage,
  PinnedAgents,
} from '@openagentspocket/core';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { createDemoConsoleStore } from '@/console/demo';
import { ConsoleStoreProvider } from '@/console/hooks';
import { ConsoleStore } from '@/console/store';
import { systemClock } from '@/console/systemClock';
import { createDemoRuntime, policyFor, setHostsRuntime } from '@/features/hosts/hostsRuntime';
import { freezeAtlasClock } from './atlasClock';

export interface AtlasData {
  /** `empty`: no Hosts at all (first run). Default `demo`: the scripted Hosts and Agents. */
  console?: 'demo' | 'empty';
  hosts?: 'demo' | 'empty';
  /** `false`: the Hosts never connected, so the first preflight asks to trust the key. */
  trusted?: boolean;
}

const DEMO_HOSTS: readonly Host[] = [
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
  const store = useMemo(
    () => (data.console === 'empty' ? emptyConsoleStore() : createDemoConsoleStore()),
    [data.console],
  );
  useEffect(() => {
    let live = true;
    const runtime = createDemoRuntime();
    setHostsRuntime(runtime);
    const seed = data.hosts === 'empty' ? [] : DEMO_HOSTS;
    const policy = policyFor(runtime.model, async () => true);
    void Promise.all(seed.map((host) => runtime.model.add(host, null)))
      // A trusted Host has its key pinned: its page opens straight to a passing preflight.
      .then(() =>
        data.trusted === false
          ? []
          : Promise.all(seed.map((host) => runtime.probe.run(host, policy))),
      )
      .then(() => {
        for (const host of seed) runtime.model.setConnection(host.id, 'connected');
        if (live) setReady(true);
      });
    return () => {
      live = false;
      setHostsRuntime(null);
    };
  }, [data.hosts, data.trusted]);
  if (!ready) return null;
  return <ConsoleStoreProvider store={store}>{children}</ConsoleStoreProvider>;
}
