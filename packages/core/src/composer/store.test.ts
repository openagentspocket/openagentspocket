import { describe, expect, it } from 'vitest';
import { HerdrApiError } from '../errors/herdr-api-error';
import { FakeClock } from '../hosts/cancellation';
import { MemoryStorage } from '../hosts/known-hosts';
import { terminalPolicy } from './policy';
import { ComposerRegistry } from './registry';
import type { ComposerAttachInput } from './store';
import { chatPolicy, rig, states } from './store.testkit';

describe('ComposerStore send', () => {
  it('keeps typing local and sends one prompt', async () => {
    const r = rig();
    let release!: () => void;
    r.gate = new Promise((resolve) => {
      release = resolve;
    });
    r.store.replaceDraft('Fix the failing tests');
    expect(r.calls).toEqual([]);
    const sending = r.store.send();
    await Promise.resolve();
    expect(r.store.getSnapshot().draft).toBe('');
    expect(states(r.store)).toEqual([{ kind: 'sending' }]);
    expect(r.calls).toEqual([{ target: 'w1:p1', text: 'Fix the failing tests' }]);
    release();
    expect(await sending).toEqual({ kind: 'deliveredViaPrompt' });
    expect(states(r.store)).toEqual([{ kind: 'delivered', progress: 'acknowledged' }]);
  });

  it('ignores a blank draft', async () => {
    const r = rig();
    r.store.replaceDraft('  \n');
    expect(await r.store.send()).toEqual({ kind: 'ignored' });
    expect(r.calls).toEqual([]);
  });

  it('holds Stop back after a send empties the draft', async () => {
    const r = rig();
    r.store.replaceDraft('go');
    await r.store.send();
    expect(r.store.stop.isHeldAfterSend).toBe(true);
    await r.clock.advance(1000);
    expect(r.store.stop.isHeldAfterSend).toBe(false);
  });

  it('retries a failed send without losing its text, and can withdraw it into the draft', async () => {
    const r = rig();
    r.failures.push(new HerdrApiError('pane_not_found', 'gone'));
    r.store.replaceDraft('again');
    expect(await r.store.send()).toEqual({ kind: 'failed' });
    const [failed] = r.store.getSnapshot().messages;
    expect(failed?.state.kind).toBe('failed');
    expect(failed?.text).toBe('again');
    expect(await r.store.retry(failed?.id ?? '')).toEqual({ kind: 'deliveredViaPrompt' });
    expect(r.calls).toHaveLength(2);

    r.failures.push(new HerdrApiError('pane_not_found', 'gone'));
    r.store.replaceDraft('second');
    await r.store.send();
    r.store.replaceDraft('typed meanwhile');
    const id = r.store.getSnapshot().messages[1]?.id ?? '';
    r.store.withdrawToDraft(id);
    expect(r.store.getSnapshot().draft).toBe('second\ntyped meanwhile');
    expect(r.store.getSnapshot().messages).toHaveLength(1);
  });
});

describe('ComposerStore launch race', () => {
  it('waits out agent_not_ready and sends the same text each time', async () => {
    const r = rig();
    const notReady = new HerdrApiError('agent_not_ready', 'not an active named agent');
    r.failures.push(notReady, notReady);
    r.store.replaceDraft('First message');
    const sending = r.store.send();
    await r.clock.advance(20);
    expect(await sending).toEqual({ kind: 'deliveredViaPrompt' });
    expect(r.calls).toHaveLength(3);
    expect(new Set(r.calls.map((c) => c.text))).toEqual(new Set(['First message']));
  });

  it('surfaces the refusal when the budget is spent', async () => {
    const r = rig('idle', { budget: 20 });
    for (let i = 0; i < 20; i++) r.failures.push(new HerdrApiError('agent_not_ready', 'nope'));
    r.store.replaceDraft('Stuck');
    const sending = r.store.send();
    await r.clock.advance(100);
    expect(await sending).toEqual({ kind: 'failed' });
    expect(r.calls.length).toBeGreaterThan(1);
    expect(r.store.getSnapshot().messages[0]?.state.kind).toBe('failed');
  });

  it('does not retry agent_not_found', async () => {
    const r = rig();
    r.failures.push(new HerdrApiError('agent_not_found', 'no such agent'));
    r.store.replaceDraft('x');
    expect(await r.store.send()).toEqual({ kind: 'failed' });
    expect(r.calls).toHaveLength(1);
  });
});

describe('ComposerStore progress from status pushes', () => {
  it('moves an acknowledged message from working to done', async () => {
    const r = rig();
    r.store.replaceDraft('go');
    await r.store.send();
    r.store.agentStatusDidChange('working');
    expect(states(r.store)).toEqual([{ kind: 'delivered', progress: 'working' }]);
    r.store.agentStatusDidChange('done');
    expect(states(r.store)).toEqual([{ kind: 'delivered', progress: 'done' }]);
  });

  it('waits for its own working phase when sent while the Agent was busy', async () => {
    const r = rig('working');
    r.store.replaceDraft('queued');
    await r.store.send();
    expect(states(r.store)).toEqual([{ kind: 'delivered', progress: 'agentBusy' }]);
    r.store.agentStatusDidChange('done');
    expect(states(r.store)).toEqual([{ kind: 'delivered', progress: 'agentBusy' }]);
    r.store.agentStatusDidChange('working');
    r.store.agentStatusDidChange('idle');
    expect(states(r.store)).toEqual([{ kind: 'delivered', progress: 'done' }]);
  });

  it('does not claim a prior Done for a new message but accepts a later one', async () => {
    const r = rig('done');
    r.store.replaceDraft('next');
    await r.store.send();
    expect(states(r.store)).toEqual([{ kind: 'delivered', progress: 'acknowledged' }]);
    r.store.agentStatusDidChange('idle');
    r.store.agentStatusDidChange('done');
    expect(states(r.store)).toEqual([{ kind: 'delivered', progress: 'done' }]);
  });
});

describe('ComposerStore Blocked', () => {
  const attach = (writes: string[], live = true): ComposerAttachInput => ({
    insertComposerDraft: (text) => {
      if (live) writes.push(text);
      return live;
    },
  });

  it('inserts a Blocked terminal draft into Attach without a prompt', async () => {
    const r = rig('blocked');
    const writes: string[] = [];
    r.store.bindAttachInput(attach(writes));
    r.store.replaceDraft('n');
    expect(await r.store.send()).toEqual({ kind: 'deliveredViaAttach' });
    expect(writes).toEqual(['n']);
    expect(r.calls).toEqual([]);
    r.store.agentStatusDidChange('working');
    expect(states(r.store)).toEqual([{ kind: 'delivered', progress: 'acknowledged' }]);
  });

  it('falls through to Attach on an agent_blocked rejection', async () => {
    const r = rig('idle');
    const writes: string[] = [];
    r.store.bindAttachInput(attach(writes));
    r.failures.push(new HerdrApiError('agent_blocked', 'blocked'));
    r.store.replaceDraft('yes');
    expect(await r.store.send()).toEqual({ kind: 'deliveredViaAttach' });
    expect(writes).toEqual(['yes']);
  });

  it('fails and keeps retry when no Attach is live', async () => {
    const r = rig('blocked');
    r.store.bindAttachInput(attach([], false));
    r.store.replaceDraft('n');
    expect(await r.store.send()).toEqual({ kind: 'failed' });
    expect(r.store.getSnapshot().messages[0]?.state.kind).toBe('failed');
  });

  it('refuses unsafe control characters without writing', async () => {
    const r = rig('blocked');
    const writes: string[] = [];
    r.store.bindAttachInput(attach(writes));
    r.store.replaceDraft('rm\u001b[2J');
    expect(await r.store.send()).toEqual({ kind: 'failed' });
    expect(writes).toEqual([]);
  });

  it('Chat refuses a Blocked agent, returns the draft and never touches the PTY', async () => {
    const r = rig('blocked');
    const writes: string[] = [];
    r.store.bindAttachInput(attach(writes));
    r.store.replaceDraft('n');
    const result = await r.store.send(chatPolicy());
    expect(result).toEqual({ kind: 'refused', refusal: { kind: 'agentBlocked' } });
    expect(r.store.getSnapshot().draft).toBe('n');
    expect(r.store.getSnapshot().messages).toEqual([]);
    expect(writes).toEqual([]);
    expect(r.calls).toEqual([]);
  });

  it('Chat returns the draft on an agent_blocked rejection', async () => {
    const r = rig('idle');
    r.failures.push(new HerdrApiError('agent_blocked', 'blocked'));
    r.store.replaceDraft('approve');
    const result = await r.store.send(chatPolicy());
    expect(result).toEqual({ kind: 'refused', refusal: { kind: 'agentBlocked' } });
    expect(r.store.getSnapshot().draft).toBe('approve');
    expect(r.calls).toHaveLength(1);
  });
});

describe('ComposerStore policies', () => {
  it('a validation refusal keeps the draft and sends nothing', async () => {
    const r = rig();
    r.store.replaceDraft('!ls');
    const refusal = { kind: 'unsafeText', reason: 'shell' } as const;
    const result = await r.store.send(chatPolicy({ validate: () => refusal }));
    expect(result).toEqual({ kind: 'refused', refusal });
    expect(r.store.getSnapshot().draft).toBe('!ls');
    expect(r.store.getSnapshot().notice).toEqual({ refusal, route: 'chat' });
    r.store.replaceDraft('ls');
    expect(r.store.getSnapshot().notice).toBeUndefined();
  });

  it('a preflight refusal keeps text typed meanwhile, in order', async () => {
    const r = rig();
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const refusal = { kind: 'inputNotReady', reason: 'has text' } as const;
    r.store.replaceDraft('first');
    const sending = r.store.send(
      chatPolicy({
        preflight: async () => {
          await hold;
          return refusal;
        },
      }),
    );
    await Promise.resolve();
    expect(r.store.getSnapshot().messages).toHaveLength(1);
    r.store.replaceDraft('second');
    release();
    expect(await sending).toEqual({ kind: 'refused', refusal });
    expect(r.store.getSnapshot().draft).toBe('first\nsecond');
    expect(r.store.getSnapshot().messages).toEqual([]);
    expect(r.calls).toEqual([]);
  });

  it('an input hold ends when Agent Status changes', async () => {
    const r = rig('working');
    r.store.replaceDraft('next step');
    const refusal = { kind: 'inputNotReady', reason: 'working' } as const;
    await r.store.send(chatPolicy({ preflight: async () => refusal }));
    expect(r.store.getSnapshot().notice?.refusal).toEqual(refusal);
    r.store.agentStatusDidChange('idle');
    expect(r.store.getSnapshot().notice).toBeUndefined();
    expect(r.store.getSnapshot().draft).toBe('next step');
  });

  it('rewrites the outgoing text and marks an unverified send undelivered, never resending', async () => {
    const r = rig();
    r.store.replaceDraft('/compact');
    await r.store.send(
      chatPolicy({ outgoingText: (text) => `${text}!`, verify: async () => false }),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(r.calls).toEqual([{ target: 'w1:p1', text: '/compact!' }]);
    expect(states(r.store)).toEqual([{ kind: 'undelivered' }]);
    expect(r.calls).toHaveLength(1);
  });
});

describe('ComposerStore draft', () => {
  it('inserts at the caret and replaces a selection without sending', () => {
    const r = rig();
    r.store.replaceDraft('hello world');
    r.store.setSelection({ start: 5, end: 5 });
    r.store.insertIntoDraft(' big');
    expect(r.store.getSnapshot().draft).toBe('hello big world');
    r.store.setSelection({ start: 0, end: 5 });
    r.store.insertIntoDraft('bye');
    expect(r.store.getSnapshot().draft).toBe('bye big world');
    expect(r.calls).toEqual([]);
  });

  it('swaps a trailing token and leaves a draft that no longer ends with it', () => {
    const r = rig();
    r.store.replaceDraft('use /sk');
    r.store.replaceTrailingToken('/sk', '/skill:web ');
    expect(r.store.getSnapshot().draft).toBe('use /skill:web ');
    r.store.replaceTrailingToken('/sk', 'x');
    r.store.replaceTrailingToken('', 'x');
    expect(r.store.getSnapshot().draft).toBe('use /skill:web ');
  });

  it('status pushes never touch the draft', () => {
    const r = rig();
    r.store.replaceDraft('keep me');
    r.store.agentStatusDidChange('working');
    r.store.agentStatusDidChange('idle');
    expect(r.store.getSnapshot().draft).toBe('keep me');
  });
});

describe('ComposerRegistry', () => {
  it('hands out one Composer per Agent and persists its draft', () => {
    const storage = new MemoryStorage();
    const clock = new FakeClock();
    const registry = new ComposerRegistry({ storage, clock });
    const input = { key: 'h/p1', target: 'p1', status: 'idle', prompt: async () => {} };
    const first = registry.composerFor(input);
    expect(registry.composerFor(input)).toBe(first);
    first.replaceDraft('draft text');
    const rebuilt = new ComposerRegistry({ storage, clock }).composerFor(input);
    expect(rebuilt.getSnapshot().draft).toBe('draft text');
    registry.discard('h/p1');
    expect(new ComposerRegistry({ storage, clock }).composerFor(input).getSnapshot().draft).toBe(
      '',
    );
  });

  it('terminal policy is the default', async () => {
    expect(terminalPolicy.insertsIntoAttachWhenBlocked).toBe(true);
  });
});
