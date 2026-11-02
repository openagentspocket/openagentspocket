import { beforeEach, describe, expect, it } from 'vitest';
import { FakeClock } from '../hosts/cancellation';
import { AgentBannerStore } from './banner-store';
import type { BannerAgent, BannerStoreOptions } from './banner-types';

const HOST = 'host-1';

function agent(pane: string, status: string, extra: Partial<BannerAgent> = {}): BannerAgent {
  return { hostId: HOST, paneId: pane, status, kind: 'claude', ...extra };
}

describe('AgentBannerStore', () => {
  let clock: FakeClock;
  let sounds: number;
  let spoken: string[];
  let screenReader: boolean;
  let presented: { hostId: string; paneId: string } | undefined;
  let triggers: BannerStoreOptions['triggers'];

  const make = (extra: Partial<BannerStoreOptions> = {}) =>
    new AgentBannerStore(clock, {
      presentedAgent: () => presented,
      triggers: (host) => triggers(host),
      playSound: () => {
        sounds += 1;
      },
      isScreenReaderOn: () => screenReader,
      announce: (text) => spoken.push(text),
      renderBody: (body) => body.key,
      ...extra,
    });

  beforeEach(() => {
    clock = new FakeClock();
    sounds = 0;
    spoken = [];
    screenReader = false;
    presented = undefined;
    triggers = () => ({ blocked: true, done: true });
  });

  it('holds a Blocked transition before announcing it with the push copy', async () => {
    const store = make();
    store.agentsDidChange([agent('p1', 'working')]);
    store.agentsDidChange([agent('p1', 'blocked')]);
    expect(store.banner).toBeUndefined();
    await clock.advance(3000);
    expect(store.banner?.title).toBe('Claude');
    expect(store.banner?.body.key).toBe('Blocked — waiting for input');
    expect(sounds).toBe(1);
  });

  it('leads the title with a known workspace and words Done', async () => {
    const store = make();
    store.agentsDidChange([agent('p1', 'working', { workspaceLabel: 'Caterm', kind: 'codex' })]);
    store.agentsDidChange([agent('p1', 'done', { workspaceLabel: 'Caterm', kind: 'codex' })]);
    await clock.advance(3000);
    expect(store.banner?.title).toBe('Caterm · Codex');
    expect(store.banner?.body.key).toBe('Done');
  });

  it('treats first sight as baseline and ignores working/idle', async () => {
    const store = make();
    store.agentsDidChange([agent('p1', 'blocked'), agent('p2', 'idle')]);
    store.agentsDidChange([agent('p1', 'blocked'), agent('p2', 'working')]);
    store.agentsDidChange([agent('p1', 'blocked'), agent('p2', 'idle')]);
    await clock.advance(10_000);
    expect(store.banner).toBeUndefined();
    expect(sounds).toBe(0);
  });

  it('drops a flap that does not hold and banners a settled one once', async () => {
    const store = make();
    store.agentsDidChange([agent('p1', 'working')]);
    store.agentsDidChange([agent('p1', 'blocked')]);
    store.agentsDidChange([agent('p1', 'working')]);
    await clock.advance(3000);
    expect(store.banner).toBeUndefined();
    store.agentsDidChange([agent('p1', 'blocked')]);
    await clock.advance(3000);
    expect(store.banner).toBeDefined();
    expect(sounds).toBe(1);
  });

  it('cancels a pending banner when the pane vanishes; reappearing is baseline', async () => {
    const store = make();
    store.agentsDidChange([agent('p1', 'working')]);
    store.agentsDidChange([agent('p1', 'blocked')]);
    store.agentsDidChange([]);
    store.agentsDidChange([agent('p1', 'blocked')]);
    await clock.advance(10_000);
    expect(store.banner).toBeUndefined();
  });

  it('never repeats for an unchanged status', async () => {
    const store = make();
    store.agentsDidChange([agent('p1', 'working')]);
    store.agentsDidChange([agent('p1', 'blocked')]);
    await clock.advance(3000);
    store.dismiss();
    store.agentsDidChange([agent('p1', 'blocked')]);
    await clock.advance(10_000);
    expect(store.banner).toBeUndefined();
    expect(sounds).toBe(1);
  });

  it('stays silent for the presented Agent, decided at fire time', async () => {
    const store = make();
    store.agentsDidChange([agent('p1', 'working'), agent('p2', 'working')]);
    store.agentsDidChange([agent('p1', 'blocked'), agent('p2', 'blocked')]);
    presented = { hostId: HOST, paneId: 'p1' };
    await clock.advance(3000);
    expect(store.banner?.target.paneId).toBe('p2');
    expect(sounds).toBe(1);
  });

  it('fails closed on unknown preferences and honors per-trigger flags', async () => {
    triggers = () => undefined;
    const store = make();
    store.agentsDidChange([agent('p1', 'working')]);
    store.agentsDidChange([agent('p1', 'blocked')]);
    await clock.advance(3000);
    expect(store.banner).toBeUndefined();

    triggers = () => ({ blocked: true, done: false });
    store.agentsDidChange([agent('p1', 'done')]);
    await clock.advance(3000);
    expect(store.banner).toBeUndefined();
    store.agentsDidChange([agent('p1', 'blocked')]);
    await clock.advance(3000);
    expect(store.banner).toBeDefined();
  });

  it('expires after the dismiss delay and a newer banner replaces the current one', async () => {
    const store = make();
    store.agentsDidChange([agent('p1', 'working'), agent('p2', 'working')]);
    store.agentsDidChange([agent('p1', 'blocked'), agent('p2', 'working')]);
    await clock.advance(3000);
    expect(store.banner?.target.paneId).toBe('p1');
    await clock.advance(2000);
    store.agentsDidChange([agent('p1', 'blocked'), agent('p2', 'done')]);
    await clock.advance(3000);
    expect(store.banner?.target.paneId).toBe('p2');
    await clock.advance(5000);
    expect(store.banner).toBeUndefined();
  });

  it('shows the question known at fire time and fills one in later', async () => {
    const store = make();
    store.agentsDidChange([agent('p1', 'working')]);
    store.agentsDidChange([agent('p1', 'blocked')]);
    store.agentsDidChange([agent('p1', 'blocked', { lastOutputSnippet: ' Allow it? ' })]);
    await clock.advance(3000);
    expect(store.banner?.question).toBe('Allow it?');
    expect(spoken).toEqual(['Claude. Allow it?']);

    const late = make();
    late.agentsDidChange([agent('p1', 'working')]);
    late.agentsDidChange([agent('p1', 'blocked')]);
    await clock.advance(3000);
    expect(late.banner?.question).toBeUndefined();
    late.agentsDidChange([agent('p1', 'blocked', { lastOutputSnippet: 'Proceed?' })]);
    expect(late.banner?.question).toBe('Proceed?');
  });

  it('never gives a Done banner a question', async () => {
    const store = make();
    store.agentsDidChange([agent('p1', 'working')]);
    store.agentsDidChange([agent('p1', 'done', { lastOutputSnippet: 'stale' })]);
    await clock.advance(3000);
    expect(store.banner?.question).toBeUndefined();
  });

  it('keeps the banner with a screen reader until the Agent moves on or it is dismissed', async () => {
    screenReader = true;
    const store = make();
    store.agentsDidChange([agent('p1', 'working')]);
    store.agentsDidChange([agent('p1', 'blocked')]);
    await clock.advance(3000);
    await clock.advance(60_000);
    expect(store.banner).toBeDefined();
    expect(spoken).toHaveLength(1);

    store.agentsDidChange([agent('p1', 'working')]);
    expect(store.banner).toBeUndefined();
  });

  it('dismisses when the Agent closes and times out once the screen reader is off', async () => {
    screenReader = true;
    const store = make();
    store.agentsDidChange([agent('p1', 'working')]);
    store.agentsDidChange([agent('p1', 'blocked')]);
    await clock.advance(3000);
    screenReader = false;
    store.agentsDidChange([agent('p1', 'blocked')]);
    await clock.advance(5000);
    expect(store.banner).toBeUndefined();

    screenReader = true;
    store.agentsDidChange([agent('p1', 'working')]);
    store.agentsDidChange([agent('p1', 'blocked')]);
    await clock.advance(3000);
    expect(store.banner).toBeDefined();
    store.agentsDidChange([]);
    expect(store.banner).toBeUndefined();
  });

  it('notifies subscribers on show and dismiss', async () => {
    const store = make();
    let calls = 0;
    const off = store.subscribe(() => {
      calls += 1;
    });
    store.agentsDidChange([agent('p1', 'working')]);
    store.agentsDidChange([agent('p1', 'blocked')]);
    await clock.advance(3000);
    store.dismiss();
    off();
    expect(calls).toBe(2);
  });
});
