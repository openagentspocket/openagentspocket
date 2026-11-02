import { failWith } from '@openagentspocket/core';
import type { SshTransport } from '../transport';

/** The operating system family a Host's SSH server runs on. */
export type HostPlatform = 'posix' | 'nativeWindows';

/** Native Windows Hosts are recognized by the server's identification string; they are not ported. */
export function hostPlatform(transport: SshTransport): HostPlatform {
  return transport.session.serverIdentification?.includes('Windows') === true
    ? 'nativeWindows'
    : 'posix';
}

/** Throws `hostFeatureUnavailable` on a native Windows Host. */
export function requirePosixHost(transport: SshTransport, feature: string): void {
  if (hostPlatform(transport) === 'nativeWindows') {
    throw failWith({ kind: 'hostFeatureUnavailable', feature });
  }
}

/** The Host account's home directory; Chat reads POSIX paths only, so a Windows Host refuses. */
export async function hostHomeDirectory(transport: SshTransport): Promise<string> {
  requirePosixHost(transport, 'Chat');
  return transport.homeDirectory();
}
