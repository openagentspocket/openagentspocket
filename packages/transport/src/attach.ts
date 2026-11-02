import {
  type AttachCommands,
  attachCommandFor,
  attachExecCommand,
  type CancelSignal,
  type Clock,
  type HerdrEndpoint,
  startAttachSession,
  type TerminalAttachRequest,
  type TerminalAttachSession,
  TransportFailure,
  targetKey,
} from '@openagentspocket/core';
import { isSshErrorCode, SshError, type SshSession } from 'agentico-ssh';
import type { ChannelAdmission } from './admission';
import { withDeadline } from './deadline';
import { mapOperationError } from './error-mapping';

/** What the Transport lends an attach: its connection, admission, socket and failure bookkeeping. */
export interface AttachContext {
  readonly session: SshSession;
  readonly admission: ChannelAdmission;
  readonly clock: Clock;
  readonly requestTimeoutMs: number;
  readonly commands: AttachCommands;
  readonly endpoint: HerdrEndpoint | null;
  /** One open channel per target: the claimed keys. */
  readonly openTargets: Set<string>;
  requireConnected(): void;
  resolvedSocketPath(signal?: CancelSignal): Promise<string>;
  /** Maps a raw failure and invalidates the connection when it died. */
  fail(error: unknown): TransportFailure;
}

/** A close reason arrives as the SSH module's code string. */
function toCause(error: unknown): unknown {
  return typeof error === 'string' && isSshErrorCode(error) ? new SshError(error) : error;
}

/**
 * Opens one interactive PTY attach for `request` on the Host's connection: admitted as an attach
 * channel, running herdr's attach through the account shell with the bootstrap handshake, its
 * output gated, filtered and diagnosed by core's attach session. A second attach for the same
 * target is refused with `terminalChannelAlreadyOpen`. (Swift `attachTerminal`.)
 */
export async function attachTerminal(
  context: AttachContext,
  request: TerminalAttachRequest,
): Promise<TerminalAttachSession> {
  const key = targetKey(request.target);
  if (context.openTargets.has(key))
    throw new TransportFailure({ kind: 'terminalChannelAlreadyOpen' });
  context.openTargets.add(key);
  let lease: { release(): void } | undefined;
  const release = () => {
    lease?.release();
    context.openTargets.delete(key);
  };
  try {
    context.requireConnected();
    lease = await context.admission.acquire('attach');
    const socketPath = await withDeadline(context.clock, context.requestTimeoutMs, (signal) =>
      context.resolvedSocketPath(signal),
    );
    const command = attachExecCommand({
      commands: context.commands,
      request,
      socketPath,
      endpoint: context.endpoint,
    });
    let pty: Awaited<ReturnType<SshSession['openPty']>>;
    try {
      pty = await context.session.openPty({
        command,
        cols: request.cols,
        rows: request.rows,
        timeoutMs: context.requestTimeoutMs,
      });
    } catch (error) {
      throw context.fail(error);
    }
    return startAttachSession(pty, {
      clock: context.clock,
      dropsStartupProbe: true,
      attachCommand: attachCommandFor(context.commands, request.target),
      endpoint: context.endpoint,
      mapError: (error) => mapOperationError(toCause(error)),
      noteFailure: (error) => {
        context.fail(toCause(error));
      },
      onFinished: release,
    });
  } catch (error) {
    release();
    throw error;
  }
}
