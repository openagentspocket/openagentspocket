import {
  DeviceKeyStore,
  FakeClock,
  type Host,
  HostCatalog,
  hostRoute,
  KnownHostsStore,
  MemorySecretStore,
  MemoryStorage,
} from '@openagentspocket/core';
import { DEFAULT_HOME_COMMAND } from '@openagentspocket/transport';
import { FakeSsh, type HostKey, utf8Decode, utf8Encode } from 'agentico-ssh';
import { deviceKeyPort } from '@/stores/deviceKeyPort';
import { createLiveServices, type LiveDeps, type LiveServices } from './liveServices';

export const KEY_ALIAS = 'test-device';

export const HOST_KEY: HostKey = {
  algorithm: 'ssh-ed25519',
  fingerprint: 'SHA256:AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
};

export const OTHER_KEY: HostKey = {
  algorithm: 'ssh-ed25519',
  fingerprint: 'SHA256:HxweGxoZGBcWFRQTEhEQDw4NDAsKCQgHBgUEAwIBAAE',
};

export const SAMPLE_HOST: Host = {
  id: 'host-1',
  name: 'Workshop',
  username: 'ada',
  authMethod: 'deviceKey',
  sessionName: '',
  herdrEndpoint: null,
  routes: [hostRoute({ id: 'route-1', address: 'workshop.example' })],
};

const AGENT = {
  agent: 'claude',
  agent_status: 'working',
  focused: false,
  pane_id: 'p1',
  revision: 1,
  tab_id: 'w1:t1',
  terminal_id: 'term_p1',
  workspace_id: 'w1',
  cwd: '/work/api',
  terminal_title_stripped: 'Migration',
  state_change_seq: 3,
};

const SNAPSHOT = {
  agents: [AGENT],
  layouts: [],
  panes: [],
  protocol: 20,
  tabs: [],
  version: 'test',
  workspaces: [],
};

function envelope(request: Uint8Array, result: object): Uint8Array {
  const { id } = JSON.parse(utf8Decode(request)) as { id: string };
  return utf8Encode(`${JSON.stringify({ id, result })}\n`);
}

/** herdr's side of the socket: answers ping and snapshot. */
export function herdrAnswers(_socket: string, request: Uint8Array): Uint8Array {
  const { method } = JSON.parse(utf8Decode(request)) as { method: string };
  if (method === 'session.snapshot') {
    return envelope(request, { type: 'session_snapshot', snapshot: SNAPSHOT });
  }
  return envelope(request, { type: 'pong', version: '0.9.4', protocol: 20 });
}

export interface World extends LiveServices {
  readonly ssh: FakeSsh;
  readonly clock: FakeClock;
  readonly prompts: { count: number; answer: boolean };
  readonly deps: LiveDeps;
  /** Acknowledges every events subscription opened so far (the Host's herdr says yes). */
  acknowledgeEvents(): void;
}

/** A live app on FakeSsh: memory stores, a herdr that answers, and a scripted trust prompt. */
export async function createWorld(hostKey: HostKey = HOST_KEY): Promise<World> {
  const ssh = new FakeSsh({
    hostKey,
    streamLocal: herdrAnswers,
    exec: {
      [`LC_ALL=C ${DEFAULT_HOME_COMMAND}`]: {
        exitCode: 0,
        stdout: '__AGENTICO_HOME__=/home/ada\n',
        stderr: '',
      },
    },
  });
  const prompts = { count: 0, answer: true };
  const clock = new FakeClock();
  const storage = new MemoryStorage();
  const deps: LiveDeps = {
    ssh,
    hostCatalog: new HostCatalog(storage, new MemorySecretStore()),
    knownHosts: new KnownHostsStore(storage),
    deviceKey: new DeviceKeyStore(deviceKeyPort(ssh)),
    storage,
    clock,
    keyAlias: KEY_ALIAS,
    randomBytes: (length) => new Uint8Array(length).fill(7),
    confirmFirstConnect: async () => {
      prompts.count += 1;
      return prompts.answer;
    },
  };
  const services = createLiveServices(deps);
  const acked = new WeakSet<object>();
  const acknowledgeEvents = () => {
    for (const session of ssh.sessions) {
      for (const stream of session.streams) {
        const first = stream.written[0];
        if (!first || acked.has(stream)) continue;
        acked.add(stream);
        const { id } = JSON.parse(utf8Decode(first)) as { id: string };
        stream.emit(
          utf8Encode(`${JSON.stringify({ id, result: { type: 'subscription_started' } })}\n`),
        );
      }
    }
  };
  return { ...services, ssh, clock, prompts, deps, acknowledgeEvents };
}
