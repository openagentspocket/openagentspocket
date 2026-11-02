import { describe, expect, it } from 'vitest';
import { HerdrApiError } from '../errors/herdr-api-error';
import { TransportFailure } from '../errors/transport-error';
import {
  closeShellTerminal,
  openTerminalFailure,
  resolveShellTerminal,
  type ShellTerminalMemory,
  type ShellTerminalRemote,
  shellCreationRequest,
} from './shell-open';
import type { ShellTerminalIdentity } from './shell-store';

const shell = (id: string): ShellTerminalIdentity => ({
  paneId: `p${id}`,
  tabId: 't',
  terminalId: id,
});

function setup(options: { remembered?: ShellTerminalIdentity; alive?: boolean | Error } = {}) {
  let stored = options.remembered;
  const calls: string[] = [];
  const remote: ShellTerminalRemote = {
    async create(request) {
      calls.push(`create ${request.cwd}`);
      return shell('new');
    },
    async verify() {
      calls.push('verify');
      const { alive = true } = options;
      if (alive instanceof Error) throw alive;
      return alive;
    },
    async close() {
      calls.push('close');
    },
  };
  const memory: ShellTerminalMemory = {
    recall: () => stored,
    remember: (identity) => {
      stored = identity;
    },
    forget: () => {
      stored = undefined;
    },
  };
  return { remote, memory, calls, stored: () => stored };
}

describe('shell creation request', () => {
  it('needs an absolute, non-blank directory', () => {
    expect(shellCreationRequest('w', '/work')).toEqual({ workspaceId: 'w', cwd: '/work' });
    expect(shellCreationRequest('w', 'relative')).toBeNull();
    expect(shellCreationRequest('w', '   ')).toBeNull();
    expect(shellCreationRequest('w', undefined)).toBeNull();
  });
});

describe('resolveShellTerminal', () => {
  const request = { workspaceId: 'w', cwd: '/work' };

  it('reattaches the remembered tab instead of creating one', async () => {
    const s = setup({ remembered: shell('old') });
    expect(await resolveShellTerminal(s.remote, s.memory, request)).toEqual(shell('old'));
    expect(s.calls).toEqual(['verify']);
  });

  it('forgets a dead tab and recreates it, remembering the fresh one', async () => {
    const s = setup({ remembered: shell('old'), alive: false });
    expect(await resolveShellTerminal(s.remote, s.memory, request)).toEqual(shell('new'));
    expect(s.calls).toEqual(['verify', 'create /work']);
    expect(s.stored()).toEqual(shell('new'));
  });

  it('an unreachable verification fails the open without creating', async () => {
    const s = setup({ remembered: shell('old'), alive: new Error('offline') });
    await expect(resolveShellTerminal(s.remote, s.memory, request)).rejects.toThrow('offline');
    expect(s.calls).toEqual(['verify']);
    expect(s.stored()).toEqual(shell('old'));
  });
});

describe('open and close failures', () => {
  it('a herdr rejection is definitive; anything else may have created a tab', () => {
    expect(openTerminalFailure(new HerdrApiError('x', 'no')).kind).toBe('rejected');
    expect(
      openTerminalFailure(new TransportFailure({ kind: 'apiRejected', code: 'x', message: 'no' }))
        .kind,
    ).toBe('rejected');
    expect(openTerminalFailure(new TransportFailure({ kind: 'timedOut' })).kind).toBe('ambiguous');
  });

  it('closing treats a pane herdr no longer knows as closed, an unreachable Host as not', async () => {
    const s = setup({ remembered: shell('a') });
    expect(await closeShellTerminal(s.remote, s.memory, shell('a'))).toEqual({ closed: true });
    expect(s.stored()).toBeUndefined();

    const gone = setup({ remembered: shell('a') });
    gone.remote.close = async () => {
      throw new HerdrApiError('pane_not_found', 'gone');
    };
    expect((await closeShellTerminal(gone.remote, gone.memory, shell('a'))).closed).toBe(true);

    const down = setup({ remembered: shell('a') });
    down.remote.close = async () => {
      throw new TransportFailure({ kind: 'sshUnreachable', detail: 'down' });
    };
    expect((await closeShellTerminal(down.remote, down.memory, shell('a'))).closed).toBe(false);
    expect(down.stored()).toEqual(shell('a'));
  });
});
