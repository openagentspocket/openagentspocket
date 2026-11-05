import { MemoryStorage, SettingsStore } from '@openagentspocket/core';
import type { ReactNode } from 'react';
import { fakeAuthenticator } from './authenticator';
import { SettingsProvider } from './SettingsProvider';

/** Test support: the settings provider with defaults, for components that read a setting. */
export function TestSettings({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider
      store={new SettingsStore(new MemoryStorage())}
      authenticator={fakeAuthenticator(null)}
    >
      {children}
    </SettingsProvider>
  );
}
