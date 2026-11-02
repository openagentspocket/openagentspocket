import { type ActivityContentState, ActivityRequestError } from '@openagentspocket/core';
import { describe, expect, it } from 'vitest';
import { createLiveActivityController, type NativeLiveActivity } from './adapter';

const content: ActivityContentState = { counts: { working: 1, blocked: 0, done: 0 } };

class FakeNative implements NativeLiveActivity {
  enabled = true;
  failRequest: string | null = null;
  readonly observed: string[] = [];
  readonly unobserved: string[] = [];
  readonly calls: string[] = [];
  private tokenListener: (e: { id: string; token: string }) => void = () => undefined;
  private stateListener: (e: { id: string; state: string }) => void = () => undefined;

  areActivitiesEnabled = () => this.enabled;
  async request(hostId: string, json: string) {
    if (this.failRequest) throw new Error(this.failRequest);
    this.calls.push(`request ${hostId} ${json}`);
    return 'act-1';
  }
  async update(id: string, json: string) {
    this.calls.push(`update ${id} ${json}`);
  }
  async end(id: string, json: string | null, immediate: boolean) {
    this.calls.push(`end ${id} ${json} ${immediate}`);
  }
  currentActivities = async () => [{ id: 'act-1', hostId: 'h1' }];
  currentContent = async (id: string) => (id === 'act-1' ? JSON.stringify(content) : null);
  observe = (id: string) => void this.observed.push(id);
  unobserve = (id: string) => void this.unobserved.push(id);
  addListener(event: string, listener: never) {
    if (event === 'onPushToken') this.tokenListener = listener;
    else this.stateListener = listener;
    return { remove: () => undefined };
  }
  token(id: string, token: string) {
    this.tokenListener({ id, token });
  }
  state(id: string, state: string) {
    this.stateListener({ id, state });
  }
}

describe('live activity adapter', () => {
  it('starts an activity with the content as JSON and returns its handle', async () => {
    const native = new FakeNative();
    const handle = await createLiveActivityController(native).request('h1', content);
    expect(handle).toEqual({ id: 'act-1', hostId: 'h1' });
    expect(native.calls[0]).toBe(`request h1 ${JSON.stringify(content)}`);
  });

  it('turns a refused request into an ActivityRequestError carrying the reason', async () => {
    const native = new FakeNative();
    native.failRequest = 'too many activities';
    const attempt = createLiveActivityController(native).request('h1', content);
    await expect(attempt).rejects.toBeInstanceOf(ActivityRequestError);
    await expect(attempt).rejects.toMatchObject({ reason: 'too many activities' });
  });

  it('reads whether activities are enabled from the OS each time', () => {
    const native = new FakeNative();
    const controller = createLiveActivityController(native);
    expect(controller.areEnabled).toBe(true);
    native.enabled = false;
    expect(controller.areEnabled).toBe(false);
  });

  it('reads the content an activity shows now, null when it is gone', async () => {
    const controller = createLiveActivityController(new FakeNative());
    expect(await controller.currentContent('act-1')).toEqual(content);
    expect(await controller.currentContent('other')).toBeNull();
  });

  it('observes natively once, fans tokens out per activity and replays the last one', () => {
    const native = new FakeNative();
    const controller = createLiveActivityController(native);
    const handle = { id: 'act-1', hostId: 'h1' };
    const first: string[] = [];
    const offFirst = controller.onPushToken(handle, (hex) => first.push(hex));
    native.token('act-1', 'aa');
    native.token('other', 'zz');
    const second: string[] = [];
    controller.onPushToken(handle, (hex) => second.push(hex));
    native.token('act-1', 'bb');
    expect(first).toEqual(['aa', 'bb']);
    expect(second).toEqual(['aa', 'bb']);
    expect(native.observed).toEqual(['act-1']);
    offFirst();
    expect(native.unobserved).toEqual([]);
  });

  it('stops observing when the last listener leaves', () => {
    const native = new FakeNative();
    const controller = createLiveActivityController(native);
    const handle = { id: 'act-1', hostId: 'h1' };
    const offToken = controller.onPushToken(handle, () => undefined);
    const offState = controller.onState(handle, () => undefined);
    offToken();
    expect(native.unobserved).toEqual([]);
    offState();
    expect(native.unobserved).toEqual(['act-1']);
  });

  it('delivers run states and ignores unknown ones', () => {
    const native = new FakeNative();
    const controller = createLiveActivityController(native);
    const seen: string[] = [];
    controller.onState({ id: 'act-1', hostId: 'h1' }, (state) => seen.push(state));
    native.state('act-1', 'dismissed');
    native.state('act-1', 'bogus');
    expect(seen).toEqual(['dismissed']);
  });
});
