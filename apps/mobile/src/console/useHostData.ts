import { type HostDataSource, type HostDataState, HostDataStore } from '@openagentspocket/core';
import { runHostDataScript, type SshTransport, systemClock } from '@openagentspocket/transport';
import { useStoreState } from '@openagentspocket/ui';
import { useEffect, useMemo } from 'react';
import { useConsoleStore } from './hooks';

const canRun = (transport: object): transport is SshTransport => 'runExec' in transport;

/** Reads a `HostDataSource` from a Host while the screen is on. A new source needs nothing else. */
export function useHostData<T>(hostId: string, source: HostDataSource<T>): HostDataState<T> {
  const console = useConsoleStore();
  const store = useMemo(
    () =>
      new HostDataStore({
        source,
        clock: systemClock,
        run: (script) =>
          console.withTransport(hostId, (transport) => {
            if (!canRun(transport)) throw new Error('This Host cannot run scripts.');
            return runHostDataScript(transport, source.key, script);
          }),
      }),
    [console, hostId, source],
  );
  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);
  return useStoreState(store);
}
