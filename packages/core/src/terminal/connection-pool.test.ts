import { describe, expect, it } from 'vitest';
import { CancelledError, createCancellation } from '../hosts/cancellation';
import { eventually, Gate, identity, makePool, PoolProbe, settle } from './pool.testkit';
import { TerminalRetentionBudget } from './retention-budget';

const base = (probe: PoolProbe, id: string, ownerId = 'owner') => ({
  hostId: 'h',
  identity: identity(id),
  ownerId,
  generation: 1,
  runTerminal: probe.runner(),
});

describe('TerminalConnectionPool', () => {
  it('selection is lazy and retapping reuses the same live pipeline', async () => {
    const probe = new PoolProbe();
    const { pool } = makePool();
    const first = await pool.select(base(probe, 'one'));
    expect(probe.requests).toHaveLength(0);
    first.store.viewDidResize(80, 24);
    await eventually(() => probe.requests.length === 1);
    pool.release('h', identity('one'), 'owner');
    expect(probe.ended).toEqual([]);
    const reused = await pool.select(base(probe, 'one'));
    expect(reused).toBe(first);
    expect(probe.requests).toHaveLength(1);
    expect(probe.requests[0]?.takeover).toBe(false);
    await pool.suspend();
    expect(probe.ended).toEqual(['one']);
  });

  it('duplicate concurrent selections share one entry; another window cannot claim it', async () => {
    const probe = new PoolProbe();
    const { pool } = makePool();
    const [a, b] = await Promise.all([
      pool.select(base(probe, 'one')),
      pool.select(base(probe, 'one')),
    ]);
    expect(a).toBe(b);
    await expect(pool.select(base(probe, 'one', 'stranger'))).rejects.toMatchObject({
      kind: 'alreadyVisible',
    });
    expect(pool.size).toBe(1);
    await pool.suspend();
  });

  it('a returning screen reclaims its pooled pipeline and idle expiry then keeps it', async () => {
    const probe = new PoolProbe();
    const { pool, clock } = makePool();
    const reclaim = (ownerId: string, sceneId?: string) =>
      pool.reclaim({ hostId: 'h', identity: identity('one'), ownerId, generation: 1, sceneId });
    expect(reclaim('x')).toBeUndefined();
    const entry = await pool.select(base(probe, 'one', 'leaving'));
    expect(reclaim('other')).toBeUndefined();
    pool.release('h', identity('one'), 'leaving');
    expect(reclaim('returning')).toBe(entry);
    await clock.advance(600_000);
    await pool.expireIdle();
    expect(pool.size).toBe(1);
    await expect(pool.select(base(probe, 'one', 'stranger'))).rejects.toMatchObject({
      kind: 'alreadyVisible',
    });
    await pool.suspend();
  });

  it('a screen remounted in the same window takes over; its predecessor late release is harmless', async () => {
    const probe = new PoolProbe();
    const { pool, clock } = makePool();
    const entry = await pool.select({ ...base(probe, 'one', 'replaced'), sceneId: 'win' });
    const successor = pool.reclaim({
      hostId: 'h',
      identity: identity('one'),
      ownerId: 'successor',
      sceneId: 'win',
      generation: 1,
    });
    expect(successor).toBe(entry);
    pool.release('h', identity('one'), 'replaced');
    await clock.advance(600_000);
    expect(pool.size).toBe(1);
    expect(
      pool.reclaim({
        hostId: 'h',
        identity: identity('one'),
        ownerId: 'x',
        sceneId: 'elsewhere',
        generation: 1,
      }),
    ).toBeUndefined();
    await pool.suspend();
  });

  it('idle expiry ends only idle terminals after the timeout, never the visible one', async () => {
    const probe = new PoolProbe();
    const { pool, clock } = makePool({ maximumShellsPerHost: 2 });
    const one = await pool.select(base(probe, 'one'));
    one.store.viewDidResize(80, 24);
    pool.release('h', identity('one'), 'owner');
    const two = await pool.select(base(probe, 'two'));
    two.store.viewDidResize(80, 24);
    await eventually(() => probe.requests.length === 2);
    await clock.advance(299_000);
    expect(pool.size).toBe(2);
    await clock.advance(1_000);
    await settle();
    expect(pool.size).toBe(1);
    expect(probe.ended).toEqual(['one']);
    expect(two.store.terminalStatus.kind).not.toBe('stopped');
    await pool.suspend();
  });

  it('LRU eviction awaits channel teardown before admitting the next terminal', async () => {
    const probe = new PoolProbe();
    const gate = new Gate();
    probe.gateEnd('one', gate);
    const { pool, clock } = makePool({ maximumShellsPerHost: 2 });
    const first = await pool.select(base(probe, 'one'));
    first.store.viewDidResize(80, 24);
    await eventually(() => probe.requests.length === 1);
    pool.release('h', identity('one'), 'owner');
    await clock.advance(1);
    const second = await pool.select(base(probe, 'two'));
    second.store.viewDidResize(80, 24);
    await eventually(() => probe.requests.length === 2);
    pool.release('h', identity('two'), 'owner');
    const third = pool.select(base(probe, 'three'));
    await eventually(() => gate.entered);
    expect(pool.size).toBe(1);
    expect(probe.requests).toHaveLength(2);
    gate.open();
    const next = await third;
    next.store.viewDidResize(80, 24);
    await eventually(() => probe.requests.length === 3);
    expect(probe.ended).toEqual(['one']);
    expect(pool.entry('h', identity('two'))).toBe(second);
    await pool.suspend();
  });

  it('cancelling a selection during eviction creates no replacement', async () => {
    const probe = new PoolProbe();
    const gate = new Gate();
    probe.gateEnd('one', gate);
    const { pool } = makePool({ maximumShellsPerHost: 1 });
    const first = await pool.select(base(probe, 'one'));
    first.store.viewDidResize(80, 24);
    await eventually(() => probe.requests.length === 1);
    pool.release('h', identity('one'), 'owner');
    const cancellation = createCancellation();
    const next = pool.select({ ...base(probe, 'two'), signal: cancellation.signal });
    await eventually(() => gate.entered);
    cancellation.cancel();
    gate.open();
    await expect(next).rejects.toBeInstanceOf(CancelledError);
    expect(pool.size).toBe(0);
    expect(probe.ended).toEqual(['one']);
  });

  it('removing a Host ends only its connections; a new generation drops idle entries', async () => {
    const probe = new PoolProbe();
    const { pool } = makePool();
    for (const hostId of ['h', 'other']) await pool.select({ ...base(probe, 'one'), hostId });
    await pool.removeHost('h');
    expect(pool.size).toBe(1);
    pool.release('other', identity('one'), 'owner');
    await pool.transportGenerationDidChange(2, 'other');
    expect(pool.size).toBe(0);
  });

  it('a stale snapshot cannot evict entries after waiting for prior teardown', async () => {
    const probe = new PoolProbe();
    const gate = new Gate();
    probe.gateEnd('one', gate);
    const { pool } = makePool({ maximumShellsPerHost: 1 });
    const first = await pool.select(base(probe, 'one'));
    first.store.viewDidResize(80, 24);
    await eventually(() => probe.requests.length === 1);
    pool.release('h', identity('one'), 'owner');
    const second = pool.select(base(probe, 'two'));
    await eventually(() => gate.entered);
    let current = true;
    const reconciliation = pool.reconcile('h', new Set(), () => current);
    await settle();
    current = false;
    gate.open();
    const replacement = await second;
    await reconciliation;
    expect(pool.entry('h', identity('two'))).toBe(replacement);
    await pool.suspend();
  });

  it('agent admission shares the shell budget and awaits shell eviction', async () => {
    const budget = new TerminalRetentionBudget(3);
    const probe = new PoolProbe();
    const gate = new Gate();
    probe.gateEnd('one', gate);
    const { pool } = makePool({ maximumShellsPerHost: 3, budget });
    for (const id of ['one', 'two', 'three']) {
      const entry = await pool.select(base(probe, id));
      entry.store.viewDidResize(80, 24);
      await eventually(() => probe.requests.some((r) => r.target.id === id));
      pool.release('h', identity(id), 'owner');
    }
    expect(pool.size).toBe(3);
    let admitted = false;
    const agent = budget
      .admit({
        key: { hostId: 'h', terminalId: 'agent' },
        ownerId: 'agent',
        isVisible: () => true,
        onEvict: async () => {},
      })
      .then(() => {
        admitted = true;
      });
    await eventually(() => gate.entered);
    expect(admitted).toBe(false);
    expect(pool.size).toBe(2);
    gate.open();
    await agent;
    expect(probe.ended).toEqual(['one']);
    await pool.suspend();
  });

  it('a route change lets the pool evict a terminal whose view has not disappeared yet', async () => {
    for (const withAgentSlot of [false, true]) {
      const budget = new TerminalRetentionBudget(3);
      const probe = new PoolProbe();
      const { pool } = makePool({ maximumShellsPerHost: 3, budget });
      if (withAgentSlot) {
        await budget.admit({
          key: { hostId: 'h', terminalId: 'agent' },
          ownerId: 'agent',
          isVisible: () => true,
          onEvict: async () => {},
        });
      }
      let presented = true;
      const first = await pool.select({ ...base(probe, 'one'), isPresented: () => presented });
      first.store.viewDidResize(80, 24);
      await eventually(() => probe.requests.length === 1);
      for (const id of withAgentSlot ? ['two'] : ['two', 'three']) {
        await pool.select(base(probe, id));
      }
      presented = false;
      const next = await pool.select(base(probe, 'next'));
      expect(pool.entry('h', identity('one'))).toBeUndefined();
      expect(pool.entry('h', identity('next'))).toBe(next);
      expect(probe.ended).toEqual(['one']);
      await pool.suspend();
    }
  });
});
