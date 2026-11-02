import {
  type Clock,
  failWith,
  type Host,
  type HostKeyPolicy,
  hostSocketLocation,
  sshRoutesForHost,
} from '@openagentspocket/core';
import type { TransportSettings } from '@openagentspocket/transport';

export interface SettingsContext {
  readonly keyAlias: string;
  readonly policy: HostKeyPolicy;
  readonly clock: Clock;
}

/**
 * How the transport reaches a catalog Host. Trust is keyed by the Host, so every route must
 * present the same key. The SSH module only authenticates with the device key: the other
 * methods fail as an unavailable feature instead of dialling with the wrong credentials.
 */
export function transportSettingsFor(host: Host, context: SettingsContext): TransportSettings {
  if (host.authMethod !== 'deviceKey') {
    throw failWith({
      kind: 'hostFeatureUnavailable',
      feature:
        host.authMethod === 'password' ? 'Password authentication' : 'RSA key authentication',
    });
  }
  return {
    routes: sshRoutesForHost(host),
    username: host.username,
    keyAlias: context.keyAlias,
    hostKeyPolicy: context.policy,
    hostKeyTrust: { kind: 'host', hostId: host.id },
    socket: hostSocketLocation(host),
    endpoint: host.herdrEndpoint,
    clock: context.clock,
  };
}
