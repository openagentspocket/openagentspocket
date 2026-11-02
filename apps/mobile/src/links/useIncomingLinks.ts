import { useRootNavigationState, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Linking } from 'react-native';
import { redirectLink } from './nativeIntent';

/** The launch URL is routed once per process; later intents arrive through the `url` event. */
let initialUrlRouted = false;

/** Test hook: lets each test start from a fresh process. */
export function resetInitialUrlRouting(): void {
  initialUrlRouted = false;
}

/**
 * Opens links that arrive from outside. Expo Router maps the launch URL, but on Android a cold start
 * (for example after `clearState`) can still land on Home, and a link tapped in a running app does
 * not always reach the router. The launch URL is read once through `Linking.getInitialURL` and routed
 * through the same mapping as soon as the navigator is ready; the `url` listener covers links
 * received while running. `navigate` reuses a screen that is already open, so a link the router also
 * handled does not open twice.
 */
export function useIncomingLinks(): void {
  const router = useRouter();
  const ready = useRootNavigationState()?.key !== undefined;
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const route = redirectLink(url);
      if (route !== url) router.navigate(route as never);
    });
    return () => subscription.remove();
  }, [router]);
  useEffect(() => {
    if (!ready || initialUrlRouted) return;
    initialUrlRouted = true;
    void Linking.getInitialURL().then((url) => {
      if (!url) return;
      const route = redirectLink(url);
      if (route !== url && route !== '/') router.navigate(route as never);
    });
  }, [ready, router]);
}
