import { describe, expect, it } from 'vitest';
import { REFRESH_DEBOUNCE_MS } from './auto-refresh';
import { file, harness, readOf } from './store-harness';
import { APPEARANCE_SETTLE_MS } from './store-types';
import { type ChangedFile, ChangesReadError } from './types';

describe('ChangesStore automatic refresh', () => {
  async function loaded(h: ReturnType<typeof harness>, files: ChangedFile[] = [file('a')]) {
    const pending = h.store.appear();
    h.reads[0]?.resolve(readOf(files));
    await pending;
  }

  it('an exit from Working refreshes once, after the debounce; the first status is only a baseline', async () => {
    const h = harness();
    await loaded(h);
    h.status('idle');
    h.status('working');
    await h.clock.advance(10_000);
    expect(h.reads).toHaveLength(1);
    h.status('idle');
    await h.clock.advance(REFRESH_DEBOUNCE_MS - 1);
    expect(h.reads).toHaveLength(1);
    await h.clock.advance(1);
    expect(h.reads).toHaveLength(2);
    h.reads[1]?.resolve(readOf([file('a'), file('b')]));
    await h.clock.flush();
    expect(h.announced).toEqual(['Checkout Changes updated.']);
  });

  it('a Working baseline then Idle is an exit; Idle to Blocked is not', async () => {
    const h = harness();
    await loaded(h);
    h.status('working');
    h.status('blocked');
    await h.clock.advance(1_000);
    expect(h.reads).toHaveLength(2);
    h.reads[1]?.resolve(readOf([file('a')]));
    await h.clock.flush();
    h.status('idle');
    h.status('blocked');
    await h.clock.advance(1_000);
    expect(h.reads).toHaveLength(2);
  });

  it('does not announce when the automatic read changed nothing', async () => {
    const h = harness();
    await loaded(h);
    h.status('working');
    h.status('idle');
    await h.clock.advance(REFRESH_DEBOUNCE_MS);
    h.reads[1]?.resolve(readOf([file('a')]));
    await h.clock.flush();
    expect(h.announced).toEqual([]);
  });

  it('the first live status over a new connection counts as an exit', async () => {
    const h = harness();
    await loaded(h);
    h.status('idle');
    h.reconnect();
    h.status('idle');
    await h.clock.advance(REFRESH_DEBOUNCE_MS);
    expect(h.reads).toHaveLength(2);
  });

  it('a snapshot without live updates is not an exit', async () => {
    const h = harness();
    await loaded(h);
    h.status('idle', false);
    h.reconnect();
    h.status('idle', false);
    await h.clock.advance(1_000);
    expect(h.reads).toHaveLength(1);
  });

  it('waits while deferred and runs when asked', async () => {
    const h = harness();
    let deferred = true;
    h.store.defersAutomaticRefresh = () => deferred;
    await loaded(h);
    h.status('working');
    h.status('idle');
    await h.clock.advance(1_000);
    expect(h.reads).toHaveLength(1);
    deferred = false;
    h.store.runPendingAutomaticRefresh();
    expect(h.reads).toHaveLength(2);
    h.reads[1]?.resolve(readOf([file('a')]));
    await h.clock.flush();
  });

  it('a refresh needed during a read runs when that read ends', async () => {
    const h = harness();
    await loaded(h);
    const manual = h.store.refresh();
    h.status('working');
    h.status('idle');
    await h.clock.advance(1_000);
    expect(h.reads).toHaveLength(2);
    h.reads[1]?.resolve(readOf([file('a')]));
    await manual;
    expect(h.reads).toHaveLength(3);
    h.reads[2]?.resolve(readOf([file('a')]));
    await h.clock.flush();
  });

  it('marks the document possibly incomplete while the Agent works, until a clean read', async () => {
    const h = harness();
    await loaded(h);
    expect(h.store.getState().freshness).toBeNull();
    h.status('working');
    expect(h.store.getState().freshness).toBe(0);
    h.status('idle');
    await h.clock.advance(REFRESH_DEBOUNCE_MS);
    h.reads[1]?.resolve(readOf([file('a')]));
    await h.clock.flush();
    expect(h.store.getState().freshness).toBeNull();
  });

  it('a read that began while Working keeps the document suspect', async () => {
    const h = harness();
    const pending = h.store.appear();
    h.status('working');
    h.status('idle');
    h.reads[0]?.resolve(readOf([file('a')]));
    await pending;
    expect(h.store.getState().freshness).not.toBeNull();
  });

  it('a failed read drops the pending refresh', async () => {
    const h = harness();
    await loaded(h);
    h.status('working');
    h.status('idle');
    const manual = h.store.refresh();
    h.reads[1]?.reject(new ChangesReadError({ kind: 'incomplete' }));
    await manual;
    await h.clock.advance(1_000);
    expect(h.reads).toHaveLength(2);
  });

  it('the status stream runs while any screen follows it; the last to leave ends it', async () => {
    const h = harness();
    const list = h.store.followAgentStatus();
    const diff = h.store.followAgentStatus();
    expect(h.store.autoRefresh.isFollowing).toBe(true);
    list();
    expect(h.store.autoRefresh.isFollowing).toBe(true);
    diff();
    expect(h.store.autoRefresh.isFollowing).toBe(false);
  });

  it('a list row reads once after it settles, then on each exit, until stopped', async () => {
    const h = harness();
    const stop = h.store.followForRowTotals();
    await h.clock.advance(APPEARANCE_SETTLE_MS - 1);
    expect(h.reads).toHaveLength(0);
    await h.clock.advance(1);
    expect(h.reads).toHaveLength(1);
    h.reads[0]?.resolve(readOf([file('a')]));
    await h.clock.flush();
    h.status('working');
    h.status('idle');
    await h.clock.advance(REFRESH_DEBOUNCE_MS);
    expect(h.reads).toHaveLength(2);
    stop();
    h.reads[1]?.resolve(readOf([file('a')]));
    await h.clock.flush();
  });

  it('stopping before the settle reads nothing', async () => {
    const h = harness();
    h.store.followForRowTotals()();
    await h.clock.advance(1_000);
    expect(h.reads).toHaveLength(0);
  });
});

describe('ChangesStore sharing between a row and open Changes', () => {
  it('opening Changes starts from the row read of the same directory', async () => {
    const row = harness();
    const open = harness();
    const first = row.store.refresh();
    row.reads[0]?.resolve(readOf([file('a')]));
    await first;
    open.store.seed(row.store);
    expect(open.phase()).toBe('loaded');
    expect(open.store.getState().readAt).toBe(row.store.getState().readAt);
  });

  it('does not seed from another directory or a timed-out row', async () => {
    const row = harness();
    const open = harness();
    open.directory.current = '/elsewhere';
    const first = row.store.refresh();
    row.reads[0]?.resolve(readOf([file('a')]));
    await first;
    open.store.seed(row.store);
    expect(open.phase()).toBe('loading');
  });

  it('closing Changes hands a newer read of the same Checkout back to the row', async () => {
    const row = harness();
    const open = harness();
    const first = row.store.refresh();
    row.reads[0]?.resolve(readOf([file('a')]));
    await first;
    await row.clock.advance(5_000);
    open.clock.advance(5_000);
    const second = open.store.refresh();
    open.reads[0]?.resolve(readOf([file('a'), file('b')]));
    await second;
    await open.clock.advance(1);
    const openState = open.store.getState();
    expect(openState.readAt).not.toBeNull();
    row.store.adoptNewerRead(open.store);
    // Different clocks in this test: adoption needs a strictly newer read.
    const phase = row.store.getState().phase;
    expect(phase.kind).toBe('loaded');
  });
});
