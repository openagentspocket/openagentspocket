import {
  createSessionHost,
  type PortSession,
  PortsStore,
  PreviewConnection,
} from '@openagentspocket/core';
import { systemClock } from '@openagentspocket/transport';
import type { SshSession } from 'agentico-ssh';
import type { PortsStoreFactory } from './registry';

/**
 * The production factory: each Ports store gets its own SSH session to the Host (never the
 * Console's), dialled lazily by `connect` with the Host's saved routes and a trusted-only Host
 * Key policy, so the preview never prompts. An `SshSession` is a `PortSession` as it stands.
 */
export function sshPortsFactory(
  connect: (hostId: string) => Promise<SshSession>,
): PortsStoreFactory {
  return ({ hostId, hostName }) => {
    const connection = new PreviewConnection<PortSession>(() => connect(hostId));
    return new PortsStore({ hostName, host: createSessionHost(connection), clock: systemClock });
  };
}
