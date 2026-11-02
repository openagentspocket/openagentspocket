import { createContext, type ReactNode, useContext, useEffect } from 'react';
import { setChangesStoreFactory } from '@/changes/registry';
import { NewAgentServicesProvider } from '@/features/new-agent/services';
import { setPortsStoreFactory } from '@/ports/registry';
import { UsageSourceProvider } from '@/usage/UsageSourceProvider';
import type { Composition } from './createComposition';

const CompositionContext = createContext<Composition | undefined>(undefined);

/** The live composition once provided; undefined in demo mode, tests and the gallery. */
export function useComposition(): Composition | undefined {
  return useContext(CompositionContext);
}

/**
 * Registers every live factory once and mounts the providers that screens read: New Agent,
 * Usage, and the composition itself (Files). Leaving (demo mode) puts the demo factories back.
 */
export function CompositionProvider({
  composition,
  children,
}: {
  composition: Composition;
  children: ReactNode;
}) {
  useEffect(() => {
    setPortsStoreFactory(composition.portsFactory);
    setChangesStoreFactory(composition.changesFactory);
    const stop = composition.start();
    return () => {
      stop();
      setPortsStoreFactory(undefined);
      setChangesStoreFactory(undefined);
    };
  }, [composition]);
  return (
    <CompositionContext.Provider value={composition}>
      <NewAgentServicesProvider services={composition.newAgent}>
        <UsageSourceProvider source={composition.usage} files={composition.usage.accountFiles}>
          {children}
        </UsageSourceProvider>
      </NewAgentServicesProvider>
    </CompositionContext.Provider>
  );
}
