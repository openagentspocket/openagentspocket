import {
  type ChatCache,
  emptyChatCache,
  type SettingKey,
  type SettingsStore,
  type SettingsValues,
} from '@openagentspocket/core';
import { createContext, type ReactNode, useContext, useSyncExternalStore } from 'react';
import type { Authenticator } from './authenticator';

interface SettingsServices {
  store: SettingsStore;
  authenticator: Authenticator;
  chatCache: ChatCache;
}

const Services = createContext<SettingsServices | null>(null);

interface ProviderProps extends Partial<Pick<SettingsServices, 'chatCache'>> {
  store: SettingsStore;
  authenticator: Authenticator;
  children: ReactNode;
}

/** Hands the settings store, the device authenticator and Chat's cache to the tree below. */
export function SettingsProvider({ store, authenticator, chatCache, children }: ProviderProps) {
  return (
    <Services.Provider value={{ store, authenticator, chatCache: chatCache ?? emptyChatCache }}>
      {children}
    </Services.Provider>
  );
}

function useServices(): SettingsServices {
  const services = useContext(Services);
  if (!services) throw new Error('Settings hooks must be used inside <SettingsProvider>');
  return services;
}

export const useSettingsStore = (): SettingsStore => useServices().store;
export const useAuthenticator = (): Authenticator => useServices().authenticator;
export const useChatCache = (): ChatCache => useServices().chatCache;

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
