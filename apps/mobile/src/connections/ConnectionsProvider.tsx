import { type ReactNode, useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import { ConsoleStoreProvider } from '@/console/hooks';
import { NotificationServicesProvider } from '@/notifications/services';
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
    services.liveActivity.start();
    void services.manager.setActive(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => {
      void services.manager.setActive(state === 'active');
      if (state === 'active') void services.liveActivity.foreground();
    });
    return () => {
      subscription.remove();
      void services.liveActivity.stop();
    };
  }, [services]);
  if (!services) return <>{children}</>;
  return (
    <ConsoleStoreProvider store={services.store}>
      <NotificationServicesProvider services={services.notifications}>
        {children}
      </NotificationServicesProvider>
    </ConsoleStoreProvider>
  );
}
