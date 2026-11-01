import type { NativeSshBridge } from './bridge';
import { fromBase64, toBase64 } from './bytes';
import { SshError, toSshError } from './errors';
import { bridgeSftp } from './sftp';
import { StreamRouter } from './streams';
import type { ConnectOptions, HostKey, SshModule, SshSession } from './types';

export const DEFAULT_TIMEOUTS = {
  connectMs: 15_000,
  execMs: 30_000,
  /** herdr API requests: one channel per request, 15 s (parity spec 1.1). */
  exchangeMs: 15_000,
  openMs: 10_000,
  sftpMs: 15_000,
} as const;

/** The herdr API response bound: 1 MiB. */
export const DEFAULT_MAX_RESPONSE_BYTES = 1_048_576;

/** Without `command`, a PTY runs the user's login shell. */
// biome-ignore lint/suspicious/noTemplateCurlyInString: a POSIX parameter expansion, not a template.
export const LOGIN_SHELL_COMMAND = 'exec "${SHELL:-/bin/sh}" -l';

async function call<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw toSshError(error);
  }
}

/**
 * The Host Key policy, applied before authentication: a pin must match exactly; without one,
 * `confirmHostKey` (when given) decides; otherwise the key is trusted on first use.
 */
export async function checkHostKey(options: ConnectOptions, presented: HostKey): Promise<void> {
  if (options.pinnedHostKey !== undefined) {
    if (options.pinnedHostKey !== presented.fingerprint) {
      throw new SshError(
        'hostKeyMismatch',
        `host key ${presented.fingerprint} is not the pinned one`,
      );
    }
    return;
  }
  if (options.confirmHostKey && !(await options.confirmHostKey(presented))) {
    throw new SshError('hostKeyRejected');
  }
}

/** Builds the public `SshModule` over the raw native bridge. */
export function createSshClient(bridge: NativeSshBridge): SshModule {
  const router = new StreamRouter(bridge);

  async function openSession(options: ConnectOptions): Promise<SshSession> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUTS.connectMs;
    const hello = await call(() => bridge.connect(options.host, options.port, timeoutMs));
    const { sessionId } = hello;
    const hostKey: HostKey = {
      algorithm: hello.hostKeyAlgorithm,
      fingerprint: hello.hostKeyFingerprint,
    };
    try {
      await checkHostKey(options, hostKey);
      await call(() =>
        bridge.authenticate(sessionId, options.username, options.keyAlias, timeoutMs),
      );
    } catch (error) {
      await bridge.disconnect(sessionId).catch(() => {});
      throw toSshError(error);
    }

    const stream = async (open: () => Promise<string>) => router.open(await call(open));
    return {
      sessionId,
      hostKey,
      serverIdentification: hello.serverIdentification ?? undefined,
      exec: async (command, { input, timeoutMs = DEFAULT_TIMEOUTS.execMs } = {}) =>
        call(() => bridge.exec(sessionId, command, input ? toBase64(input) : null, timeoutMs)),
      exchangeStreamLocal: async (socketPath, request, options = {}) =>
        fromBase64(
          await call(() =>
            bridge.exchangeStreamLocal(
              sessionId,
              socketPath,
              toBase64(request),
              options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
              options.timeoutMs ?? DEFAULT_TIMEOUTS.exchangeMs,
            ),
          ),
        ),
      openStreamLocal: (socketPath, { timeoutMs = DEFAULT_TIMEOUTS.openMs } = {}) =>
        stream(() => bridge.openStreamLocal(sessionId, socketPath, timeoutMs)),
      openPty: ({ command, term, cols, rows, timeoutMs = DEFAULT_TIMEOUTS.openMs }) =>
        stream(() =>
          bridge.openPty(
            sessionId,
            command ?? LOGIN_SHELL_COMMAND,
            term ?? 'xterm-256color',
            cols,
            rows,
            timeoutMs,
          ),
        ),
      openTcp: (host, port, { timeoutMs = DEFAULT_TIMEOUTS.openMs } = {}) =>
        stream(() => bridge.openTcp(sessionId, host, port, timeoutMs)),
      forwardLocal: async (remoteHost, remotePort) => {
        const { forwardId, localPort } = await call(() =>
          bridge.startForward(sessionId, remoteHost, remotePort),
        );
        return { localPort, close: () => call(() => bridge.stopForward(forwardId)) };
      },
      sftp: async ({ timeoutMs = DEFAULT_TIMEOUTS.sftpMs } = {}) =>
        bridgeSftp(bridge, await call(() => bridge.sftpOpen(sessionId, timeoutMs)), call),
      isConnected: () => call(() => bridge.isConnected(sessionId)),
      disconnect: () => call(() => bridge.disconnect(sessionId)),
    };
  }

  return {
    generateKey: async (alias) => ({ publicKey: await call(() => bridge.generateKey(alias)) }),
    publicKey: (alias) => call(() => bridge.publicKey(alias)),
    deleteKey: (alias) => call(() => bridge.deleteKey(alias)),
    connect: openSession,
  };
}
