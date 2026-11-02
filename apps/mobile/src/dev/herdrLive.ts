import {
  type EventSubscription,
  fingerprintDisplay,
  KnownHostsStore,
  serverInfoFromPing,
} from '@openagentspocket/core';
import { connectTransport, systemClock } from '@openagentspocket/transport';
import type { SshModule } from 'agentico-ssh';
import { check } from './harnessIo';
import type { HarnessParams } from './sshHarness';

const SUBSCRIPTIONS: EventSubscription[] = [{ kind: 'workspace.created' }];
const EVENT_WAIT_MS = 10_000;

/**
 * The live herdr step: the real transport (route race, TOFU through core, requests, events)
 * against the isolated backend. Connects, applies the protocol floor to `ping`, takes a
 * snapshot, subscribes, creates one workspace to provoke exactly one event, then removes it.
 */
export async function runHerdrLive(ssh: SshModule, params: HarnessParams): Promise<string> {
  const transport = await connectTransport(ssh, {
    routes: [{ host: params.host, port: params.port, jump: null, id: null }],
    username: params.user,
    keyAlias: params.alias,
    hostKeyPolicy: {
      knownHosts: new KnownHostsStore(),
      confirmFirstConnect: async (candidate) =>
        !params.pin || fingerprintDisplay(candidate.fingerprint) === params.pin,
    },
    socket: { kind: 'absolutePath', path: params.herdrSocket },
    clock: systemClock,
  });
  let workspaceId: string | undefined;
  try {
    const info = serverInfoFromPing(await transport.ping());
    const snapshot = await transport.sessionSnapshot();
    check(typeof snapshot === 'object' && snapshot !== null, 'no snapshot');
    const stream = await transport.subscribeToEvents(SUBSCRIPTIONS);
    try {
      const created = await transport.createWorkspace({ focus: false, label: 'harness' });
      workspaceId = created.workspace.workspace_id;
      const iterator = stream.events[Symbol.asyncIterator]();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), EVENT_WAIT_MS);
      });
      const first = await Promise.race([iterator.next(), timeout]);
      clearTimeout(timer);
      check(first !== 'timeout' && !first.done, 'no event within 10 s');
      return `herdr ${info.version} protocol ${info.protocolVersion}, event ${first.value.kind}`;
    } finally {
      await stream.end();
    }
  } finally {
    if (workspaceId) await transport.closeWorkspace(workspaceId).catch(() => undefined);
    await transport.close().catch(() => undefined);
  }
}
