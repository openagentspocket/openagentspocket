import {
  applyApproval,
  approvalAsksSourceOf,
  readApprovalAsks,
  runHostDataScript,
  type SshTransport,
} from '@openagentspocket/transport';
import type { ConsoleStore } from '@/console/store';
import { waitForLiveHost } from '@/console/waitForLiveHost';
import type { ApprovalHost, HostCatalogSource } from './runtime';

/** The asks and the apply over the Console's connection to each Host. */
export function approvalHost(
  store: ConsoleStore<SshTransport>,
  hosts: HostCatalogSource,
): ApprovalHost {
  const endpoint = (hostId: string) =>
    hosts.getSnapshot().hosts.find((host) => host.id === hostId)?.herdrEndpoint ?? null;
  return {
    source: (hostId) =>
      store.withTransport(hostId, (transport) => approvalAsksSourceOf(transport, endpoint(hostId))),
    run: (hostId, script) =>
      store.withTransport(hostId, (transport) =>
        runHostDataScript(transport, 'approval-asks', script),
      ),
    readAsks: async (hostId) => {
      await waitForLiveHost(store, hostId);
      return store.withTransport(hostId, (transport) =>
        readApprovalAsks(transport, endpoint(hostId)),
      );
    },
    apply: (hostId, request) =>
      store.withTransport(hostId, (transport) =>
        applyApproval(transport, request, endpoint(hostId)),
      ),
  };
}
