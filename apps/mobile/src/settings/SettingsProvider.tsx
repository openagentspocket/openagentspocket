import {
  type ChatCache,
  emptyChatCache,
  type SettingKey,
  type SettingsStore,
  type SettingsValues,
} from '@openagentspocket/core';
import { createContext, type ReactNode, useContext, useSyncExternalStore } from 'react';
import { type AppUpdates, disabledUpdates } from '@/updates/appUpdates';
import type { Authenticator } from './authenticator';

interface SettingsServices {
  store: SettingsStore;
  authenticator: Authenticator;
  chatCache: ChatCache;
  updates: AppUpdates;
}

const Services = createContext<SettingsServices | null>(null);

interface ProviderProps extends Partial<Pick<SettingsServices, 'chatCache' | 'updates'>> {
  store: SettingsStore;
  authenticator: Authenticator;
  children: ReactNode;
}

/**
 * Hands the settings store, the device authenticator, Chat's cache and the build's over-the-air
 * updates (off when absent: tests, web) to the tree below.
 */
export function SettingsProvider({
  store,
  authenticator,
  chatCache,
  updates,
  children,
}: ProviderProps) {
  const value = {
    store,
    authenticator,
    chatCache: chatCache ?? emptyChatCache,
    updates: updates ?? disabledUpdates,
  };
  return <Services.Provider value={value}>{children}</Services.Provider>;
}

function useServices(): SettingsServices {
  const services = useContext(Services);
  if (!services) throw new Error('Settings hooks must be used inside <SettingsProvider>');
  return services;
}

export const useSettingsStore = (): SettingsStore => useServices().store;
export const useAuthenticator = (): Authenticator => useServices().authenticator;
export const useChatCache = (): ChatCache => useServices().chatCache;
export const useAppUpdates = (): AppUpdates => useServices().updates;

/** All settings, re-rendering on any change. */
export function useSettings(): Readonly<SettingsValues> {
  const store = useSettingsStore();
  return useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
}

/** One setting and its setter. */
export function useSetting<K extends SettingKey>(
  key: K,
): [SettingsValues[K], (v: SettingsValues[K]) => void] {
  const store = useSettingsStore();
  const value = useSyncExternalStore(
    store.subscribe,
    () => store.get(key),
    () => store.get(key),
  );
  return [value, (next) => store.set(key, next)];
}
