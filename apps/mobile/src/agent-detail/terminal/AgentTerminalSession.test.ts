import { ScriptedTerminalSession, scriptedRunner, TransportFailure } from '@openagentspocket/core';
import { AgentTerminalSession } from './AgentTerminalSession';

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup(generations: number[]) {
  const sessions = generations.map(() => new ScriptedTerminalSession());
  const { runner, requests } = scriptedRunner(
    generations.map((generation, index) => async () => ({
      session: sessions[index] ?? new ScriptedTerminalSession(),
      generation,
    })),
  );
  let projected = generations[0] ?? 0;
  const listeners = new Set<() => void>();
  const session = new AgentTerminalSession('pane-1', {
    runner,
    transportGeneration: () => projected,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  return {
    session,
    sessions,
    requests,
    project(generation: number) {
      projected = generation;
      for (const listener of [...listeners]) listener();
    },
  };
}

describe('AgentTerminalSession', () => {
  it('routes keys and typed text to the live PTY', async () => {
    const { session, sessions } = setup([1]);
    session.getStore().viewDidResize(80, 24);
    await settle();
    sessions[0]?.emit(Uint8Array.of(0x24));
    await settle();
    session.keyboard.sendQuickKey('escape');
    session.keyboard.toggleModifier('control');
    session.keyboard.typed('c');
    expect(sessions[0]?.sent.map((bytes) => [...bytes])).toEqual([[0x1b], [0x03]]);
    await session.dispose();
  });

  it('replaces the surface when a reattach lands on an older Transport', async () => {
    const { session, sessions, project } = setup([1, 1]);
    const first = session.getStore();
    first.viewDidResize(80, 24);
    await settle();
    sessions[0]?.emit(Uint8Array.of(0x24));
    await settle();

    project(2);
    session.didBecomeActive();
    sessions[0]?.finish(new TransportFailure({ kind: 'sshUnreachable', detail: 'dropped' }));
    await settle();
    await settle();

    expect(session.getStore()).not.toBe(first);
    expect(session.getStore().surfaceId).not.toBe(first.surfaceId);
    expect(first.status.kind).toBe('stopped');
    await session.dispose();
  });

  it('keeps the surface when the reattach lands on the projected Transport', async () => {
    const { session, sessions, project } = setup([2, 2]);
    const first = session.getStore();
    first.viewDidResize(80, 24);
    await settle();
    sessions[0]?.emit(Uint8Array.of(0x24));
    await settle();
    project(2);
    session.didBecomeActive();
    sessions[0]?.finish(new TransportFailure({ kind: 'sshUnreachable', detail: 'dropped' }));
    await settle();
    await settle();
    expect(session.getStore()).toBe(first);
    await session.dispose();
  });
});
