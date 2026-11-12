import { useSyncExternalStore } from 'react';
import { isDemoMode, subscribeDemoMode } from './mode';

/** Whether demo mode is on, following the Settings switch, the dev flag and overrides as they change. */
export function useDemoMode(): boolean {
  return useSyncExternalStore(subscribeDemoMode, isDemoMode);
}
