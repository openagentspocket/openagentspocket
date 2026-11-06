import { systemClock } from '@openagentspocket/transport';
import { type ReactNode, useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { CompositionProvider } from '@/composition/CompositionProvider';
import { deviceComposition } from '@/composition/deviceComposition';
import { ConsoleStoreProvider } from '@/console/hooks';
import { ConversationsProvider } from '@/conversations/useConversation';
import { createLiveShellServices } from '@/features/terminals/liveServices';
import {
  type ShellTerminalServices,
  ShellTerminalServicesProvider,
} from '@/features/terminals/services';
import { NotificationServicesProvider } from '@/notifications/services';
import { deviceServices } from './deviceServices';
import type { LiveServices } from './liveServices';
import { isDemoMode, subscribeDemoMode } from './mode';

let shells: ShellTerminalServices | undefined;

/** One set per app run: the pool's retention budget spans every screen. */
function shellServices({ store }: LiveServices): ShellTerminalServices {
  shells ??= createLiveShellServices({
    console: store,
    clock: systemClock,
    hostName: (hostId) => store.getState().hosts.find((host) => host.id === hostId)?.name ?? '',
  });
  return shells;
}

/**
 * Starts the live connections and hands the Console its store, unless demo mode is on (then
 * the Console keeps its scripted data). Foreground resumes the Hosts; leaving it suspends them
 * after a grace. Flipping demo mode at runtime suspends the Hosts or resumes them.
 */
export function ConnectionsProvider({ children }: { children: ReactNode }) {
  const demo = useSyncExternalStore(subscribeDemoMode, isDemoMode);
  useEffect(() => {
    if (demo) return;
    const { manager, liveActivity } = deviceServices();
    manager.start();
    liveActivity.start();
    void manager.setActive(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => {
      void manager.setActive(state === 'active');
      deviceServices().conversations.setActive(state === 'active');
      if (state === 'active') void liveActivity.foreground();
    });
    return () => {
      subscription.remove();
      void manager.setActive(false, { immediately: true });
      deviceServices().conversations.setActive(false);
      void liveActivity.stop();
    };
  }, [demo]);
  if (demo) return <>{children}</>;
  const services = deviceServices();
  return (
    <ConsoleStoreProvider store={services.store}>
      <ConversationsProvider registry={services.conversations}>
        <NotificationServicesProvider services={services.notifications}>
          <CompositionProvider composition={deviceComposition()}>
            <ShellTerminalServicesProvider services={shellServices(services)}>
              {children}
            </ShellTerminalServicesProvider>
          </CompositionProvider>
        </NotificationServicesProvider>
      </ConversationsProvider>
    </ConsoleStoreProvider>
  );
}
