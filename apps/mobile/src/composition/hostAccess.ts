import {
  type CancelSignal,
  ExecGate,
  type FileBrowserHost,
  type LocalFiles,
  SftpFileBrowserHost,
} from '@openagentspocket/core';
import type { HostPlatform, SshTransport } from '@openagentspocket/transport';
import type { SshSession } from 'agentico-ssh';
import type { FileBrowserSource } from '@/files/source';

/** What the composition needs from the connections: a Host's live transport, on demand. */
export interface HostAccess {
  withTransport<V>(hostId: string, operation: (transport: SshTransport) => Promise<V>): Promise<V>;
  /** Undefined before the Host first connected. */
  platformOf(hostId: string): HostPlatform | undefined;
  /** A second, trusted-only SSH session (never prompts), for the Ports preview. */
  connectDedicated(hostId: string): Promise<SshSession>;
}

/** Git runs one exec at a time per Host; Files and Changes share the gate. */
export class HostGates {
  private readonly gates = new Map<string, ExecGate>();

  gate(hostId: string): ExecGate {
    let gate = this.gates.get(hostId);
    if (!gate) {
      gate = new ExecGate();
      this.gates.set(hostId, gate);
    }
    return gate;
  }
}

/**
 * The SFTP file browser of a Host that resolves the live transport on every call, so a
 * reconnect never leaves the screen holding a dead session. Each operation runs inside
 * `withTransport`, which waits for a replacement while the Host redials.
 */
export function liveFileBrowserHost(
  access: HostAccess,
  gates: HostGates,
  hostId: string,
  local: LocalFiles,
): FileBrowserHost {
  const hosts = new WeakMap<SshTransport, SftpFileBrowserHost>();
  const on = <V>(operation: (host: SftpFileBrowserHost) => Promise<V>): Promise<V> =>
    access.withTransport(hostId, (transport) => {
      let host = hosts.get(transport);
      if (!host) {
        host = new SftpFileBrowserHost(transport.session, local, {
          gitGate: (run) => gates.gate(hostId).run(run),
        });
        hosts.set(transport, host);
      }
      return operation(host);
    });
  return {
    homeDirectory: () => on((host) => host.homeDirectory()),
    list: (path) => on((host) => host.list(path)),
    status: (path) => on((host) => host.status(path)),
    download: (request, progress, signal: CancelSignal) =>
      on((host) => host.download(request, progress, signal)),
    upload: (request, progress, signal: CancelSignal) =>
      on((host) => host.upload(request, progress, signal)),
    rename: (path, newName) => on((host) => host.rename(path, newName)),
    delete: (path, kind) => on((host) => host.delete(path, kind)),
    ignoredNames: (directory, candidates) => on((host) => host.ignoredNames(directory, candidates)),
  };
}

/** The Files screen's source for one Host, optionally opened at a directory. */
export function liveFileSource(
  access: HostAccess,
  gates: HostGates,
  host: { id: string; name: string },
  startPath?: string,
): FileBrowserSource {
  return {
    hostName: host.name,
    startPath,
    createHost: async (local) => liveFileBrowserHost(access, gates, host.id, local),
  };
}
