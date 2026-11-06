import {
  CancelledError,
  type CancelSignal,
  failWith,
  type HostKeyVerificationGate,
  type SSHJump,
  type SSHRoute,
  type TransportError,
} from '@openagentspocket/core';
import type { SshModule, SshSession } from 'agentico-ssh';
import { mapConnectError } from './error-mapping';
import { checkPresentedHostKey } from './host-key';
import { DEFAULT_CONNECT_TIMEOUT_MS, type TransportSettings } from './settings';

/** Where the phone dials to reach the Host through a Jump Host. */
export const JUMP_LOCAL_HOST = '127.0.0.1';

/** An authenticated Jump Host holding a forward to the Host. */
export interface JumpHop {
  readonly localPort: number;
  isConnected(): Promise<boolean>;
  close(): Promise<void>;
}

/**
 * Logs in to the Jump Host and forwards a local port to the Host. The Jump Host's key is trusted
 * by its own endpoint; every failure here is the Jump Host's, and the Host is never dialed.
 */
export async function openJumpHop(
  ssh: SshModule,
  route: SSHRoute,
  jump: SSHJump,
  settings: TransportSettings,
  gate: HostKeyVerificationGate,
  signal: CancelSignal,
): Promise<JumpHop> {
  let refusal: TransportError | null = null;
  let session: SshSession | undefined;
  try {
    session = await ssh.connect({
      host: jump.host,
      port: jump.port,
      username: jump.username,
      keyAlias: settings.keyAlias,
      credential: settings.credential,
      timeoutMs: settings.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
      confirmHostKey: async (key) => {
        refusal = await checkPresentedHostKey(
          {
            host: jump.host,
            port: jump.port,
            trust: { kind: 'endpoint' },
            policy: settings.hostKeyPolicy,
            gate,
            signal,
          },
          key,
        );
        return refusal === null;
      },
    });
    const forward = await session.forwardLocal(route.host, route.port);
    const held = session;
    return {
      localPort: forward.localPort,
      isConnected: () => held.isConnected(),
      close: async () => {
        await forward.close().catch(() => undefined);
        await held.disconnect().catch(() => undefined);
      },
    };
  } catch (error) {
    await session?.disconnect().catch(() => undefined);
    if (error instanceof CancelledError) throw failWith({ kind: 'cancelled' });
    throw failWith({ kind: 'jumpHostFailed', underlying: refusal ?? mapConnectError(error) });
  }
}

/** The Host's session, which ends its hop with it and is lost when the hop is. */
export function sessionThroughHop(session: SshSession, hop: JumpHop): SshSession {
  const disconnect = session.disconnect.bind(session);
  const isConnected = session.isConnected.bind(session);
  return Object.assign(session, {
    disconnect: async () => {
      await disconnect();
      await hop.close();
    },
    isConnected: async () => (await hop.isConnected()) && (await isConnected()),
  });
}
