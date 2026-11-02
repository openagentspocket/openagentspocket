import {
  type AccountFileStore,
  FakeUsageSource,
  MemoryAccountFileStore,
  type UsageSource,
} from '@openagentspocket/core';
import { createContext, type ReactNode, useContext, useMemo } from 'react';

interface UsageServices {
  readonly source: UsageSource;
  readonly files: AccountFileStore;
}

const demoServices: UsageServices = {
  source: new FakeUsageSource(),
  files: new MemoryAccountFileStore(),
};

const UsageServicesContext = createContext<UsageServices>(demoServices);

interface Props {
  source: UsageSource;
  files: AccountFileStore;
  children: ReactNode;
}

/**
 * Where the Usage screens read from. Without a provider they read the demo source; the app mounts
 * one over the live per-Host source (`LiveUsageSource` and its `accountFiles`) once Hosts connect.
 */
export function UsageSourceProvider({ source, files, children }: Props) {
  const value = useMemo(() => ({ source, files }), [source, files]);
  return <UsageServicesContext.Provider value={value}>{children}</UsageServicesContext.Provider>;
}

export const useUsageSource = (): UsageSource => useContext(UsageServicesContext).source;
export const useAccountFiles = (): AccountFileStore => useContext(UsageServicesContext).files;
