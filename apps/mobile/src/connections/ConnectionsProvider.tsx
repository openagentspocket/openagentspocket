import { type ReactNode, useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { CompositionProvider } from '@/composition/CompositionProvider';
import { deviceComposition } from '@/composition/deviceComposition';
import { ConsoleStoreProvider } from '@/console/hooks';
import { ConversationsProvider } from '@/conversations/useConversation';
import { deviceServices } from './deviceServices';
import { isDemoMode, subscribeDemoMode } from './mode';

/**
 * Starts the live connections and hands the Console its store, unless demo mode is on (then
 * the Console keeps its scripted data). Foreground resumes the Hosts, background suspends them.
 * Flipping demo mode at runtime suspends the Hosts or resumes them.
 */
export function ConnectionsProvider({ children }: { children: ReactNode }) {
  const demo = useSyncExternalStore(subscribeDemoMode, isDemoMode);
  useEffect(() => {
    if (demo) return;
    const { manager } = deviceServices();
    manager.start();
    void manager.setActive(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => {
      void manager.setActive(state === 'active');
      deviceServices().conversations.setActive(state === 'active');
    });
    return () => {
      subscription.remove();
      void manager.setActive(false);
      deviceServices().conversations.setActive(false);
    };
  }, [demo]);
  if (demo) return <>{children}</>;
  const services = deviceServices();
  return (
    <ConsoleStoreProvider store={services.store}>
      <ConversationsProvider registry={services.conversations}>
        <CompositionProvider composition={deviceComposition()}>{children}</CompositionProvider>
      </ConversationsProvider>
    </ConsoleStoreProvider>
  );
}
