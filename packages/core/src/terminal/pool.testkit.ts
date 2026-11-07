import { FakeClock } from '../hosts/cancellation';
import { TerminalConnectionPool, type TerminalConnectionPoolOptions } from './connection-pool';
import { ScriptedTerminalSession } from './scripted';
import type { ShellTerminalIdentity } from './shell-store';
import type { TerminalAttachRequest, TerminalSessionRunner } from './types';

export const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

export const identity = (terminalId: string): ShellTerminalIdentity => ({
  paneId: `pane-${terminalId}`,
  tabId: 'tab',
  terminalId,
});

export class Gate {
  private release!: () => void;
  readonly opened = new Promise<void>((resolve) => {
    this.release = resolve;
  });
  entered = false;
  open() {
    this.release();
  }
}

/** Records attach requests and which terminals ended; a gate can hold one terminal's teardown. */
export class PoolProbe {
  readonly requests: TerminalAttachRequest[] = [];
  readonly ended: string[] = [];
  readonly sessions: ScriptedTerminalSession[] = [];
  private readonly endGates = new Map<string, Gate>();

  gateEnd(terminalId: string, gate: Gate) {
    this.endGates.set(terminalId, gate);
  }

  runner(): TerminalSessionRunner {
    return async (request, handler) => {
      this.requests.push(request);
      const session = new ScriptedTerminalSession();
      this.sessions.push(session);
      const end = session.end.bind(session);
      session.end = async () => {
        const gate = this.endGates.get(request.target.id);
        if (gate) {
          gate.entered = true;
          await gate.opened;
        }
        await end();
        if (!this.ended.includes(request.target.id)) this.ended.push(request.target.id);
      };
      await handler.runEndingSession(session);
    };
  }
}

export function makePool(options: Partial<TerminalConnectionPoolOptions> = {}) {
  const clock = new FakeClock();
  const pool = new TerminalConnectionPool({ clock, ...options });
  return { pool, clock };
}

export async function eventually(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50 && !predicate(); attempt += 1) await settle();
  if (!predicate()) throw new Error('condition never held');
}
