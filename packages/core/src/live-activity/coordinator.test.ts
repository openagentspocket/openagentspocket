import { describe, expect, it } from 'vitest';
import { ActivityRequestError } from './controller';
import { connected, flush, makeWorld, PANE, row, started } from './coordinator-world.testkit';
import { openActivity } from './envelope';

describe('start / update / end', () => {
  it('starts after the settle, not on first sight', async () => {
    const w = await makeWorld();
    await w.coordinator.start();
    w.coordinator.agentsDidChange([row(PANE, 'working')]);
    await flush();
    expect(w.controller.requested).toHaveLength(0);
    await w.settle();
    expect(w.controller.requested).toHaveLength(1);
    expect(w.controller.requested[0]?.counts).toEqual({ working: 1, blocked: 0, done: 0 });
    expect(w.coordinator.note('h1')).toEqual({ kind: 'started' });
  });

  it('seals the details under the Host key', async () => {
    const w = await makeWorld();
    await started(w);
    const envelope = w.controller.requested[0]?.envelope;
    const key = w.keys.record('h1')?.key ?? new Uint8Array();
    expect(openActivity({ ...envelope }, key).agents.map((a) => a.paneId)).toEqual([PANE]);
  });

  it('a flap back to the applied desire changes nothing', async () => {
    const w = await makeWorld();
    await started(w);
    w.coordinator.agentsDidChange([]);
    w.coordinator.agentsDidChange([row(PANE, 'working')]);
    await w.settle();
    expect(w.controller.ended).toHaveLength(0);
    expect(w.controller.requested).toHaveLength(1);
    expect(w.controller.updates).toHaveLength(0);
  });

  it('coalesces to the latest desire', async () => {
    const w = await makeWorld();
    await started(w);
    w.coordinator.agentsDidChange([row(PANE, 'blocked')]);
    w.coordinator.agentsDidChange([row(PANE, 'done')]);
    await w.settle();
    expect(w.controller.updates).toHaveLength(1);
    expect(w.controller.updates[0]?.content.counts).toEqual({ working: 0, blocked: 0, done: 1 });
  });

  it('ends on an empty eligible set and clears the token field', async () => {
    const w = await makeWorld();
    const id = await started(w);
    w.controller.emitToken(id, 'dead');
    await w.coordinator.settled();
    await flush();
    expect(w.liveToken()).toBe('dead');
    w.coordinator.agentsDidChange([row(PANE, 'idle')]);
    await w.settle();
    expect(w.controller.ended[0]?.immediate).toBe(true);
    expect(w.liveToken()).toBeUndefined();
  });

  it('rewrites the field when the token rotates', async () => {
    const w = await makeWorld();
    const id = await started(w);
    w.controller.emitToken(id, 'aa');
    await w.settle();
    expect(w.liveToken()).toBe('aa');
    w.controller.emitToken(id, 'bb');
    await w.settle();
    expect(w.liveToken()).toBe('bb');
  });

  it('switching the preference off ends the activity and clears the field', async () => {
    const w = await makeWorld();
    const id = await started(w);
    w.controller.emitToken(id, 'aa');
    await w.settle();
    w.coordinator.setEnabled(false, 'h1');
    await w.settle();
    expect(w.controller.ended).toHaveLength(1);
    expect(w.liveToken()).toBeUndefined();
  });
});

describe('fail closed', () => {
  it('stays idle when the Host toggle is off', async () => {
    const w = await makeWorld({ enabled: false });
    await w.coordinator.start();
    w.coordinator.agentsDidChange([row(PANE, 'blocked')]);
    await w.settle();
    expect(w.controller.requested).toHaveLength(0);
  });

  it('stays idle without a Notification Key', async () => {
    const w = await makeWorld({ register: false });
    await w.coordinator.start();
    w.coordinator.agentsDidChange([row(PANE, 'blocked')]);
    await w.settle();
    expect(w.controller.requested).toHaveLength(0);
  });

  it('stays idle without a device token', async () => {
    const w = await makeWorld();
    w.state.token = null;
    await w.coordinator.start();
    w.coordinator.agentsDidChange([row(PANE, 'blocked')]);
    await w.settle();
    expect(w.controller.requested).toHaveLength(0);
  });

  it('stays idle when iOS disables activities, and reports a refused request', async () => {
    const w = await makeWorld();
    w.controller.areEnabled = false;
    await w.coordinator.start();
    w.coordinator.agentsDidChange([row(PANE, 'blocked')]);
    await w.settle();
    expect(w.controller.requested).toHaveLength(0);

    w.controller.areEnabled = true;
    w.controller.requestError = new ActivityRequestError('too many activities');
    w.coordinator.agentsDidChange([row(PANE, 'working')]);
    await w.settle();
    expect(w.coordinator.note('h1')).toEqual({
      kind: 'startFailed',
      reason: 'too many activities',
    });
  });
});

describe('registration writes', () => {
  it('a dirty token write retries once the connection is back', async () => {
    const w = await makeWorld();
    const id = await started(w);
    w.transport.failWrites = true;
    w.state.statuses.set('h1', { kind: 'suspended' });
    w.controller.emitToken(id, 'cc');
    await w.settle();
    expect(w.liveToken()).toBeUndefined();

    w.transport.failWrites = false;
    w.state.statuses.set('h1', connected);
    w.coordinator.connectionsDidChange();
    await w.settle();
    expect(w.liveToken()).toBe('cc');
  });

  it('does not retry a dirty write while the Host is still offline', async () => {
    const w = await makeWorld();
    const id = await started(w);
    w.transport.failWrites = true;
    w.controller.emitToken(id, 'cc');
    await w.settle();
    w.transport.failWrites = false;
    w.state.statuses.set('h1', { kind: 'suspended' });
    w.coordinator.connectionsDidChange();
    await w.settle();
    expect(w.liveToken()).toBeUndefined();
  });

  it('a pin change rebuilds the order and writes the pin list', async () => {
    const w = await makeWorld();
    const id = await started(w, [row('p-a', 'working'), row('p-b', 'working')]);
    w.controller.emitToken(id, 'aa');
    await w.settle();
    w.state.pins = ['p-b'];
    w.coordinator.pinsDidChange();
    await w.settle();
    expect(w.livePins()).toEqual(['p-b']);
    const shown = w.controller.updates.at(-1)?.content.envelope;
    const key = w.keys.record('h1')?.key ?? new Uint8Array();
    expect(openActivity({ ...shown }, key).agents.map((a) => a.paneId)).toEqual(['p-b', 'p-a']);
  });

  it('dismissal while foregrounded clears the field', async () => {
    const w = await makeWorld();
    const id = await started(w);
    w.controller.emitToken(id, 'aa');
    await w.settle();
    w.controller.emitState(id, 'dismissed');
    await w.settle();
    expect(w.liveToken()).toBeUndefined();
  });
});

describe('adoption and reconnects', () => {
  it('adopts a known activity and writes its token', async () => {
    const w = await makeWorld();
    w.controller.seed('old', 'h1');
    w.controller.emitToken('old', 'ab');
    await w.coordinator.start();
    w.coordinator.agentsDidChange([row(PANE, 'working')]);
    await w.settle();
    expect(w.liveToken()).toBe('ab');
    expect(w.controller.ended).toHaveLength(0);
  });

  it('ends an orphan activity of an unknown Host', async () => {
    const w = await makeWorld();
    w.controller.seed('orphan', 'gone');
    await w.coordinator.start();
    expect(w.controller.ended).toEqual([{ id: 'orphan', finalContent: null, immediate: true }]);
  });

  it('an empty slice during a reconnect does not end the activity; an empty snapshot afterwards does', async () => {
    const w = await makeWorld();
    await started(w);
    w.state.statuses.set('h1', { kind: 'suspended' });
    w.state.awaiting.add('h1');
    w.coordinator.connectionsDidChange();
    w.coordinator.agentsDidChange([]);
    await w.settle();
    expect(w.controller.ended).toHaveLength(0);

    w.state.statuses.set('h1', connected);
    w.state.awaiting.delete('h1');
    w.coordinator.connectionsDidChange();
    await w.settle();
    expect(w.controller.ended).toHaveLength(1);
  });

  it('does not end an adopted activity before the first snapshot', async () => {
    const w = await makeWorld();
    w.controller.seed('old', 'h1');
    w.state.awaiting.add('h1');
    await w.coordinator.start();
    w.coordinator.agentsDidChange([]);
    await w.settle();
    expect(w.controller.ended).toHaveLength(0);
  });

  it('reconcile notices an activity the system dropped', async () => {
    const w = await makeWorld();
    const id = await started(w);
    w.controller.emitToken(id, 'aa');
    await w.settle();
    w.controller.end(id, null, true);
    await w.coordinator.reconcile();
    await w.settle();
    expect(w.liveToken()).toBeUndefined();
  });
});

describe('Hosts leaving', () => {
  it('forgetting a Host ends its activity and forgets the opt-in', async () => {
    const w = await makeWorld();
    const id = await started(w);
    w.state.hosts = [];
    await w.coordinator.forgetHost('h1');
    expect(w.controller.ended.map((e) => e.id)).toEqual([id]);
    expect(w.coordinator.isEnabled('h1')).toBe(false);
    const writes = w.transport.writes.length;
    w.controller.emitToken(id, 'zz');
    await w.settle();
    expect(w.transport.writes).toHaveLength(writes);
  });

  it('a Host outside the catalog writes nothing while its activity is live', async () => {
    const w = await makeWorld();
    const id = await started(w);
    w.state.hosts = [];
    const writes = w.transport.writes.length;
    w.controller.emitToken(id, 'zz');
    await w.settle();
    expect(w.transport.writes).toHaveLength(writes);
  });

  it('stop cancels the subscriptions', async () => {
    const w = await makeWorld();
    await started(w);
    expect(w.controller.tokenSubscriberCount).toBe(1);
    await w.coordinator.stop();
    expect(w.controller.tokenSubscriberCount).toBe(0);
  });
});
