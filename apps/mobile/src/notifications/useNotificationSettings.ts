import type { PushRegistrationState } from '@openagentspocket/core';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useNotificationServices } from './services';

/** The settings screen's state: push permission/token, per-Host states, and the actions. */
export function useNotificationSettings() {
  const { store, relay, pushToken, pluginVersionOf } = useNotificationServices();
  const states = useSyncExternalStore(store.subscribe, () => store.states);
  const relayText = useSyncExternalStore(relay.subscribe, () => relay.rawValue);
  const [push, setPush] = useState<PushRegistrationState>({ kind: 'unknown' });

  useEffect(() => {
    let live = true;
    pushToken.state().then((next) => live && setPush(next));
    return () => {
      live = false;
    };
  }, [pushToken]);

  // The per-Host rows appear the moment the token lands.
  const hasToken = push.kind === 'registered';
  useEffect(() => {
    if (hasToken) void store.refresh();
  }, [hasToken, store]);

  const enable = useCallback(async () => {
    setPush({ kind: 'waitingForToken' });
    setPush(await pushToken.enable());
  }, [pushToken]);

  const refresh = useCallback(() => store.refresh(), [store]);
  return { store, relay, relayText, states, push, enable, refresh, pluginVersionOf };
}
