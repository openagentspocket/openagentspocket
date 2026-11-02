import type { Href } from 'expo-router';
import type { LinkDestination } from './resolveLink';

/** The typed route a resolved link opens. */
export function destinationHref(destination: LinkDestination): Href {
  switch (destination.kind) {
    case 'agent':
      return {
        pathname: '/agent/[hostId]/[paneId]',
        params: { hostId: destination.hostId, paneId: destination.paneId },
      };
    case 'usage':
      return destination.limits ? '/usage-limits' : '/usage';
    default:
      return '/';
  }
}
