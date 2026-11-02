import { type ReactNode, useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import { ConsoleStoreProvider } from '@/console/hooks';
import { deviceServices } from './deviceServices';
import { isDemoMode } from './mode';

/**
 * Starts the live connections and hands the Console its store, unless demo mode is on (then
 * the Console keeps its scripted data). Foreground resumes the Hosts, background suspends them.
 */
export function ConnectionsProvider({ children }: { children: ReactNode }) {
  const services = useMemo(() => (isDemoMode() ? null : deviceServices()), []);
  useEffect(() => {
    if (!services) return;
    services.manager.start();
    void services.manager.setActive(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => {
      void services.manager.setActive(state === 'active');
    });
    return () => subscription.remove();
  }, [services]);
  if (!services) return <>{children}</>;
  return <ConsoleStoreProvider store={services.store}>{children}</ConsoleStoreProvider>;
}
