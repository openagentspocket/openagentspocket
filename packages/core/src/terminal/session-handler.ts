import type { TransportError } from '../errors/transport-error';
import { TransportFailure } from '../errors/transport-error';
import type { CancelSignal } from '../hosts/cancellation';
import type {
  TerminalAttachRequest,
  TerminalAttachSession,
  TerminalSessionHandler,
  TerminalSessionRunner,
} from './types';

/** Builds the handler a runner receives: `operation` consumes the session, ownership stays here. */
export function makeSessionHandler(
  operation: (session: TerminalAttachSession) => Promise<void>,
  transportReady: (generation: number) => void = () => {},
): TerminalSessionHandler {
  const run = (session: TerminalAttachSession) => operation(session);
  return {
    transportDidBecomeReady: transportReady,
    run,
    async runEndingSession(session) {
      try {
        await run(session);
      } catch (error) {
        if (
          error instanceof TransportFailure &&
          error.error.kind === 'terminalChannelAlreadyOpen'
        ) {
          throw error;
        }
        await session.end();
        throw error;
      }
      await session.end();
    },
  };
}

/** The simplest runner: one `open` per attempt, handed to the handler with owned teardown. */
export function runnerFor(
  open: (
    request: TerminalAttachRequest,
    signal: CancelSignal,
  ) => Promise<{ session: TerminalAttachSession; generation?: number }>,
): TerminalSessionRunner {
  return async (request, handler, signal) => {
    const { session, generation } = await open(request, signal);
    if (generation !== undefined) handler.transportDidBecomeReady(generation);
    await handler.runEndingSession(session);
  };
}

export const failureKind = (error: unknown): TransportError['kind'] | null =>
  error instanceof TransportFailure ? error.error.kind : null;
