import {
  type CancelSignal,
  type ConsoleTransport,
  type TerminalAttachRequest,
  type TerminalAttachSession,
  type TerminalSessionRunner,
  TransportFailure,
  targetKey,
} from '@openagentspocket/core';

/** The Transport that can open a PTY attach; the live SSH one does, scripted ones may not. */
export interface AttachCapable {
  attachTerminal(request: TerminalAttachRequest): Promise<TerminalAttachSession>;
}

export function canAttach(
  transport: ConsoleTransport,
): transport is ConsoleTransport & AttachCapable {
  return 'attachTerminal' in transport && typeof transport.attachTerminal === 'function';
}

/** What the runner needs from the Console store (`ConsoleStore` satisfies it). */
export interface TerminalHostSource {
  withTerminalTransport<V>(
    hostId: string,
    operation: (transport: ConsoleTransport, transportGeneration: number) => Promise<V>,
    options: { target?: string | null; signal?: CancelSignal },
  ): Promise<V>;
}

/**
 * The runner for one Host: waits for its ping-proven Transport under a per-target permit,
 * reports the generation it acquired, then lets the handler own the session's lifetime
 * (`runEndingSession`: teardown on every outcome except a refused second channel).
 */
export function hostTerminalRunner(
  source: TerminalHostSource,
  hostId: string,
): TerminalSessionRunner {
  return (request, handler, signal) =>
    source.withTerminalTransport(
      hostId,
      async (transport, generation) => {
        if (!canAttach(transport)) {
          throw new TransportFailure({ kind: 'sshUnreachable', detail: 'No terminal channel.' });
        }
        handler.transportDidBecomeReady(generation);
        const session = await transport.attachTerminal(request);
        await handler.runEndingSession(session);
      },
      { target: targetKey(request.target), signal },
    );
}
