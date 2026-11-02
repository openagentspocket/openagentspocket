// Which herdr instance a Host targets, as the Chat cache keys it (`ChatCacheKey.herdrSession`):
// `""` for the default session, `name:<n>` for a named one, `path:<p>` for an endpoint's own socket.

import type { Host } from '../../hosts/host';
import { herdrSessionFromSocketPath } from '../../pairing/endpoint';

export function chatHerdrSession(
  host: Pick<Host, 'sessionName' | 'herdrEndpoint'> | undefined,
): string {
  if (!host) return '';
  const endpoint = host.herdrEndpoint;
  if (endpoint) {
    const session = herdrSessionFromSocketPath(endpoint.socketPath);
    if (session === null) return `path:${endpoint.socketPath}`;
    return session === '' ? '' : `name:${session}`;
  }
  const name = host.sessionName.trim();
  return name === '' ? '' : `name:${name}`;
}
