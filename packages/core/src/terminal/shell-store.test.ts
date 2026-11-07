import { describe, expect, it } from 'vitest';
import { eventually, identity, PoolProbe } from './pool.testkit';
import { ShellTerminalStore } from './shell-store';

function make(probe: PoolProbe, generation: number | null = 1) {
  return new ShellTerminalStore({
    identity: identity('t1'),
    transportGeneration: generation,
    isOnStage: () => true,
    runTerminal: probe.runner(),
  });
}

describe('ShellTerminalStore', () => {
  it('attaches the remembered terminal id without takeover, never creating', async () => {
    const probe = new PoolProbe();
    const store = make(probe);
    store.viewDidResize(80, 24);
    await eventually(() => probe.requests.length === 1);
    expect(probe.requests[0]?.target).toEqual({ kind: 'terminal', id: 't1' });
    expect(probe.requests[0]?.takeover).toBe(false);
    await store.leave();
    expect(probe.ended).toEqual(['t1']);
  });

  it('a newer Host generation replaces the pipeline with the same terminal id', async () => {
    const probe = new PoolProbe();
    const store = make(probe);
    store.viewDidResize(80, 24);
    await eventually(() => probe.requests.length === 1);
    const before = store.terminal;
    store.transportGenerationDidChange(2);
    await eventually(() => store.terminal !== before);
    store.viewDidResize(100, 30);
    await eventually(() => probe.requests.length === 2);
    expect(probe.requests[1]?.target.id).toBe('t1');
    await store.leave();
  });

  it('a return on the same connection keeps a live terminal attached', async () => {
    const probe = new PoolProbe();
    const store = make(probe);
    store.viewDidResize(80, 24);
    await eventually(() => probe.sessions.length === 1);
    probe.sessions[0]?.emit(new Uint8Array([104]));
    await eventually(() => store.terminal.status.kind === 'live');
    const before = store.terminal;
    store.didBecomeActive(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(store.terminal).toBe(before);
    expect(probe.ended).toEqual([]);
    await store.leave();
  });

  it('take over reattaches with the takeover flag', async () => {
    const probe = new PoolProbe();
    const store = make(probe);
    store.viewDidResize(80, 24);
    await eventually(() => probe.requests.length === 1);
    store.takeOverTerminal();
    await eventually(() => store.getVersion() === 1);
    store.viewDidResize(81, 24);
    await eventually(() => probe.requests.length === 2);
    expect(probe.requests[1]?.takeover).toBe(true);
    await store.leave();
  });
});
