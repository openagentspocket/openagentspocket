import {
  type Clock,
  failWith,
  type Host,
  type HostKeyPolicy,
  hostSocketLocation,
  sshRoutesForHost,
} from '@openagentspocket/core';
import type { TransportSettings } from '@openagentspocket/transport';
import type { SshCredential } from 'agentico-ssh';

/** Where a Host's saved secrets live (the catalog on the secure store). */
export interface HostSecrets {
  password(host: Host): Promise<string | null>;
  rsaKey(host: Host): Promise<string | null>;
}

export interface SettingsContext {
  readonly keyAlias: string;
  readonly policy: HostKeyPolicy;
  readonly clock: Clock;
  /** Required for Hosts that authenticate with a password or an RSA key. */
  readonly secrets?: HostSecrets;
}

/** The saved password or RSA key; a missing one reads as a rejected login, not a crash. */
function savedCredential(host: Host, secrets: HostSecrets | undefined) {
  return async (): Promise<SshCredential> => {
    if (host.authMethod === 'password') {
      const password = await secrets?.password(host);
      if (password === null || password === undefined)
        throw failWith({ kind: 'authenticationFailed' });
      return { kind: 'password', password };
    }
    const privateKey = await secrets?.rsaKey(host);
    if (privateKey === null || privateKey === undefined) throw failWith({ kind: 'rsaKeyCorrupt' });
    return { kind: 'rsaKey', privateKey };
  };
}

/**
 * How the transport reaches a catalog Host. Trust is keyed by the Host, so every route must
 * present the same key. A password or RSA key is read from the secret store only after the
 * Host Key was accepted.
 */
export function transportSettingsFor(host: Host, context: SettingsContext): TransportSettings {
  const deviceKey = host.authMethod === 'deviceKey';
  return {
    routes: sshRoutesForHost(host),
    username: host.username,
    keyAlias: deviceKey ? context.keyAlias : undefined,
    credential: deviceKey ? undefined : savedCredential(host, context.secrets),
    hostKeyPolicy: context.policy,
    hostKeyTrust: { kind: 'host', hostId: host.id },
    socket: hostSocketLocation(host),
    endpoint: host.herdrEndpoint,
    clock: context.clock,
  };
}
