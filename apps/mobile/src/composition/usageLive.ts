import {
  type Clock,
  type Host,
  hostDisplayName,
  type KeyValueStorage,
  LiveUsageSource,
  type UsageHostPort,
} from '@openagentspocket/core';
import { type SshTransport, usageHostPort } from '@openagentspocket/transport';
import type { ConsoleStore } from '@/console/store';
import type { HostAccess } from './hostAccess';

/** A Usage port that resolves the Host's current transport per call, so a reconnect is invisible. */
function livePort(access: HostAccess, host: Host): UsageHostPort {
  const ports = new WeakMap<SshTransport, UsageHostPort>();
  const on = <V>(operation: (port: UsageHostPort) => Promise<V>) =>
    access.withTransport(host.id, (transport) => {
      let port = ports.get(transport);
      if (!port) {
        port = usageHostPort(transport, {
          endpoint: host.herdrEndpoint,
          session: host.sessionName === '' ? null : host.sessionName,
        });
        ports.set(transport, port);
      }
      return operation(port);
    });
  return {
    readPlugin: () => on((port) => port.readPlugin()),
    query: (args) => on((port) => port.query(args)),
    readAccountFile: () => on((port) => port.readAccountFile()),
    replaceAccountFile: (text) => on((port) => port.replaceAccountFile(text)),
  };
}

interface Deps {
  readonly access: HostAccess;
  readonly console: Pick<ConsoleStore, 'getState' | 'subscribe'>;
  readonly hosts: () => readonly Host[];
  readonly clock: Clock;
  readonly storage: KeyValueStorage;
}

/**
 * The live Usage source plus the follower that keeps its Hosts in step with the Console: a
 * connected Host gets a port, any other gets none. Call the returned function to stop following.
 */
export function createUsageLive(deps: Deps): { source: LiveUsageSource; follow: () => () => void } {
  const source = new LiveUsageSource({ clock: deps.clock, storage: deps.storage });
  const follow = () => {
    let last = '';
    const sync = () => {
      const connected = new Set(
        deps.console
          .getState()
          .hosts.filter((summary) => summary.status?.kind === 'connected')
          .map((summary) => summary.id),
      );
      const hosts = deps.hosts();
      const signature = JSON.stringify(
        hosts.map((host) => [host.id, hostDisplayName(host), connected.has(host.id)]),
      );
      if (signature === last) return;
      last = signature;
      source.setHosts(
        hosts.map((host) => ({
          id: host.id,
          name: hostDisplayName(host),
          port: connected.has(host.id) ? livePort(deps.access, host) : null,
        })),
      );
    };
    sync();
    return deps.console.subscribe(sync);
  };
  return { source, follow };
}
