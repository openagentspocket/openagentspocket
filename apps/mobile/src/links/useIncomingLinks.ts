import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Linking } from 'react-native';
import { redirectLink } from './nativeIntent';

/**
 * Opens links that arrive while the app is already running. Expo Router maps the launch URL, but on
 * Android a link tapped in a running app does not always reach the router; this listener routes it
 * through the same mapping. `navigate` reuses a screen that is already open, so a link the router
 * also handled does not open twice.
 */
export function useIncomingLinks(): void {
  const router = useRouter();
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const route = redirectLink(url);
      if (route !== url) router.navigate(route as never);
    });
    return () => subscription.remove();
  }, [router]);
}
