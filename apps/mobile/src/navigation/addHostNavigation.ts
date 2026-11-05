import { type Href, useRootNavigationState, useRouter } from 'expo-router';
import { hrefs } from './hrefs';

/**
 * How the Add Host sheet hands over to its choice. From Home the sheet's route is replaced by the
 * Hosts modal; from inside the Hosts modal the choice is navigated to inside that same stack, so no
 * second Hosts modal piles up on the first.
 */
export function addHostHandover(rootRouteNames: readonly string[]): 'replace' | 'navigate' {
  return rootRouteNames.includes('hosts') ? 'navigate' : 'replace';
}

/** The Add Host sheet's handlers: close, Easy Pair, Add Manually. The one place that knows where each lands. */
export function useAddHostNavigation() {
  const router = useRouter();
  const names = useRootNavigationState()?.routes.map((route) => route.name) ?? [];
  const go = (href: Href) =>
    addHostHandover(names) === 'navigate' ? router.navigate(href) : router.replace(href);
  return {
    close: () => router.back(),
    easyPair: () => go(hrefs.easyPair()),
    addManually: () => go(hrefs.hostForm()),
  };
}
