import type { ShellExec } from '../changes/exec';
import { errorMessage } from '../errors/message';
import { asTransportError, type TransportError, TransportFailure } from '../errors/transport-error';
import { canonicalAllowedAddress } from './address';
import type { PreviewConnection, PreviewSession } from './connection';
import { nothingAnsweredDetail } from './failure';
import type { PortPreviewHost, PortPreviewTunnel, TunnelEndpoint } from './host';
import { listListeningPorts } from './probe';
import { type ForwardTarget, targetHost } from './types';

/**
 * The slice of `SshSession` the Ports feature uses, declared here so core never imports the SSH
 * module: the real session satisfies it structurally.
 */
export interface PortSession extends PreviewSession {
  exec: ShellExec;
  /** direct-tcpip behind a 127.0.0.1 listener on the phone. */
  forwardLocal(
    remoteHost: string,
    remotePort: number,
  ): Promise<{ localPort: number; close(): Promise<void> }>;
  /** direct-tcpip duplex; used to ask why a page failed. */
  openTcp(
    host: string,
    port: number,
    options?: { timeoutMs?: number },
  ): Promise<{ close(): Promise<void> }>;
}

/** How long the "why did the page fail" channel probe waits. */
export const CHANNEL_PROBE_TIMEOUT_MS = 5_000;

function codeOf(thrown: unknown): string | null {
  if (typeof thrown === 'object' && thrown !== null && 'code' in thrown) {
    const { code } = thrown as { code: unknown };
    return typeof code === 'string' ? code : null;
  }
  return null;
}

/**
 * A session failure as the transport error the screens present. The SSH module reports a stable
 * `code`; a `TransportFailure` passes through untouched.
 */
export function mapSessionError(thrown: unknown, port: number): TransportError {
  if (thrown instanceof TransportFailure) return thrown.error;
  const detail = errorMessage(thrown);
  switch (codeOf(thrown)) {
    case 'targetUnreachable':
      return { kind: 'channelFailed', detail: nothingAnsweredDetail(port) };
    case 'forwardingDenied':
      return { kind: 'tcpForwardingUnavailable' };
    case 'timedOut':
      return { kind: 'timedOut' };
    case 'cancelled':
      return { kind: 'cancelled' };
    case 'authenticationFailed':
      return { kind: 'authenticationFailed' };
    case 'connectionFailed':
    case 'connectionInvalidated':
    case 'closed':
      return { kind: 'sshUnreachable', detail };
    default:
      return asTransportError(thrown);
  }
}

/** The address a channel may open to, re-validated whatever the caller computed. */
function checkedHost(target: ForwardTarget): string {
  const host = targetHost(target);
  const allowed = target.kind === 'hostAddress' ? canonicalAllowedAddress(host) : host;
  if (allowed === null) {
    throw new TransportFailure({
      kind: 'channelFailed',
      detail: 'This address is not reachable through SSH safely.',
    });
  }
  return allowed;
}

/**
 * A tunnel on the preview's session: the module's `forwardLocal` listens on `127.0.0.1` and pumps
 * every accepted connection through its own direct-tcpip channel. The native listener takes any
 * free phone port (the Swift tunnel re-bound the last one), so a reopened tunnel may move; the
 * web view follows it (see `tunnelUrl`).
 */
export class SessionTunnel implements PortPreviewTunnel {
  private forward: { localPort: number; close(): Promise<void> } | null = null;

  constructor(
    private readonly connection: PreviewConnection<PortSession>,
    private readonly target: ForwardTarget,
  ) {}

  async start(): Promise<TunnelEndpoint> {
    if (this.forward) return this.endpoint(this.forward.localPort);
    const host = checkedHost(this.target);
    try {
      const session = await this.connection.session();
      this.forward = await session.forwardLocal(host, this.target.port);
    } catch (thrown) {
      throw new TransportFailure(mapSessionError(thrown, this.target.port));
    }
    return this.endpoint(this.forward.localPort);
  }

  async stop(): Promise<void> {
    const forward = this.forward;
    this.forward = null;
    await forward?.close().catch(() => undefined);
  }

  /**
   * Opens one channel to the target and closes it: the cause when nothing answered or sshd
   * refuses forwarding. Other failures (a slow link) say nothing about the page.
   */
  async lastFailure(): Promise<TransportError | null> {
    if (!this.forward) return null;
    try {
      const session = await this.connection.session();
      const channel = await session.openTcp(checkedHost(this.target), this.target.port, {
        timeoutMs: CHANNEL_PROBE_TIMEOUT_MS,
      });
      await channel.close().catch(() => undefined);
      return null;
    } catch (thrown) {
      const mapped = mapSessionError(thrown, this.target.port);
      const nothingAnswered =
        mapped.kind === 'channelFailed' &&
        mapped.detail === nothingAnsweredDetail(this.target.port);
      return mapped.kind === 'tcpForwardingUnavailable' || nothingAnswered ? mapped : null;
    }
  }

  private endpoint(localPort: number): TunnelEndpoint {
    return { url: `http://127.0.0.1:${localPort}/`, localPort };
  }
}

/** The production Host: the preview's own session carries the discovery and every tunnel. */
export function createSessionHost(connection: PreviewConnection<PortSession>): PortPreviewHost {
  return {
    async listListeningPorts() {
      try {
        const session = await connection.session();
        return await listListeningPorts((command, options) => session.exec(command, options));
      } catch (thrown) {
        throw new TransportFailure(mapSessionError(thrown, 0));
      }
    },
    makeTunnel: (target) => new SessionTunnel(connection, target),
    disconnect: () => connection.disconnect(),
    close: () => connection.close(),
  };
}
