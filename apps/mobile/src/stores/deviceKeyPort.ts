import type { DeviceKeyPort } from '@openagentspocket/core';
import type { SshModule } from 'agentico-ssh';

/** Adapts the native SSH client to the core device-key port. */
export function deviceKeyPort(
  ssh: Pick<SshModule, 'generateKey' | 'publicKey' | 'deleteKey'>,
): DeviceKeyPort {
  return {
    generateKey: (alias) => ssh.generateKey(alias),
    publicKey: (alias) => ssh.publicKey(alias),
    deleteKey: (alias) => ssh.deleteKey(alias),
  };
}
