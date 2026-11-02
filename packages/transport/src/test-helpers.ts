import {
  FakeClock,
  type HostKeyPolicy,
  type JsonObject,
  KnownHostsStore,
  type SSHRoute,
} from '@openagentspocket/core';
import {
  FakeSsh,
  type FakeSshOptions,
  type FakeStream,
  type HostKey,
  utf8Decode,
  utf8Encode,
} from 'agentico-ssh';
import { connectTransport } from './connect';
import type { TransportSettings } from './settings';
import type { SshTransport } from './transport';

export const SOCKET = '/run/herdr/herdr.sock';

/** A well-formed SHA-256 host key fingerprint (32 bytes, base64 without padding). */
export const HOST_KEY: HostKey = {
  algorithm: 'ssh-ed25519',
  fingerprint: 'SHA256:AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
};

export const directRoute = (host: string, id: string | null = null): SSHRoute => ({
  host,
  port: 22,
  jump: null,
  id,
});

export function policy(confirm: () => boolean = () => true): HostKeyPolicy & {
  prompts: number;
} {
  const state = {
    prompts: 0,
    knownHosts: new KnownHostsStore(),
    confirmFirstConnect: async () => {
      state.prompts += 1;
      return confirm();
    },
  };
  return state;
}

export function settingsFor(overrides: Partial<TransportSettings> = {}): TransportSettings {
  return {
    routes: [directRoute('host.test', 'r1')],
    username: 'dev',
    keyAlias: 'device',
    hostKeyPolicy: policy(),
    socket: { kind: 'absolutePath', path: SOCKET },
    clock: new FakeClock(),
    ...overrides,
  };
}

/** The wire line of a success envelope for `request` (`type` is the result tag). */
export function reply(request: Uint8Array, result: JsonObject): Uint8Array {
  const { id } = JSON.parse(utf8Decode(request)) as { id: string };
  return utf8Encode(`${JSON.stringify({ id, result })}\n`);
}

export function methodOf(request: Uint8Array): string {
  return (JSON.parse(utf8Decode(request)) as { method: string }).method;
}

export function paramsOf(request: Uint8Array): JsonObject {
  return (JSON.parse(utf8Decode(request)) as { params: JsonObject }).params;
}

/** A FakeSsh whose device key exists and whose socket answers through `handler`. */
export async function fakeSsh(
  handler: (socket: string, request: Uint8Array) => Uint8Array,
  options: FakeSshOptions = {},
): Promise<FakeSsh> {
  const ssh = new FakeSsh({ streamLocal: handler, hostKey: HOST_KEY, ...options });
  await ssh.generateKey('device');
  return ssh;
}

export async function connected(
  handler: (socket: string, request: Uint8Array) => Uint8Array,
  overrides: Partial<TransportSettings> = {},
  options: FakeSshOptions = {},
): Promise<{ transport: SshTransport; ssh: FakeSsh; settings: TransportSettings }> {
  const ssh = await fakeSsh(handler, options);
  const settings = settingsFor(overrides);
  return { transport: await connectTransport(ssh, settings), ssh, settings };
}

/** Lets promise reactions run without moving the fake clock. */
export const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

/** The request line a stream received, parsed. */
export function writtenRequest(stream: FakeStream): {
  id: string;
  method: string;
  params: JsonObject;
} {
  const first = stream.written[0];
  if (!first) throw new Error('nothing written');
  return JSON.parse(utf8Decode(first).trim()) as { id: string; method: string; params: JsonObject };
}
