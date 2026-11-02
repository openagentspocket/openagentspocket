import type { PortsStore } from '@openagentspocket/core';
import { useEffect } from 'react';
import { AppState } from 'react-native';

/**
 * Tells the store when the app leaves and returns, so a preview past the grace period stops its
 * tunnel and reopens it (spec: background grace 15 s). `inactive` (the app switcher, a system
 * sheet) does not count: the tunnel stays up.
 */
export function useAppActivity(store: PortsStore): void {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') store.sceneDidEnterBackground();
      else if (state === 'active') store.sceneDidBecomeActive();
    });
    return () => subscription.remove();
  }, [store]);
}
