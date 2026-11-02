import { describe, expect, it } from 'vitest';
import { TransportFailure } from '../errors/transport-error';
import { ExecGate } from './observable';
import { makeFile } from './status';
import { file, harness, readOf } from './store-harness';
import { ChangesReadError } from './types';

describe('ChangesStore reads', () => {
  it('reads once per store; returning to the view reads nothing new', async () => {
    const h = harness();
    const first = h.store.appear();
    expect(h.phase()).toBe('loading');
    h.reads[0]?.resolve(readOf([file('a')]));
    await first;
    expect(h.phase()).toBe('loaded');
    expect(h.store.getState().readAt).toBe(0);
    await h.store.appear();
    expect(h.reads).toHaveLength(1);
  });

  it('refresh is single-flight and keeps the document on screen while it runs', async () => {
    const h = harness();
    const first = h.store.refresh();
    h.reads[0]?.resolve(readOf([file('a')]));
    await first;
    const again = h.store.refresh();
    const dup = h.store.refresh();
    expect(h.reads).toHaveLength(2);
    expect(h.store.getState().isRefreshing).toBe(true);
    expect(h.phase()).toBe('loaded');
    h.reads[1]?.resolve(readOf([file('a'), file('b')]));
    await Promise.all([again, dup]);
    expect(h.store.getState().isRefreshing).toBe(false);
    const phase = h.store.getState().phase;
    expect(phase.kind === 'loaded' && phase.changes.files).toHaveLength(2);
  });

  it('an Agent with no working directory fails without reading', async () => {
    const h = harness({ directory: null });
    await h.store.refresh();
    expect(h.phase()).toBe('failed');
    expect(h.reads).toHaveLength(0);
  });

  it('reads where the Agent is now, and remembers the last directory', async () => {
    const h = harness();
    const first = h.store.refresh();
    h.reads[0]?.resolve(readOf([]));
    await first;
    h.directory.current = '/r/other';
    const second = h.store.refresh();
    h.directory.current = null;
    h.reads[1]?.resolve(readOf([]));
    await second;
    expect(h.reads.map((r) => r.directory)).toEqual(['/r/app', '/r/other']);
    const third = h.store.refresh();
    expect(h.reads[2]?.directory).toBe('/r/other');
    h.reads[2]?.resolve(readOf([]));
    await third;
  });

  it('git outcomes become their own phases; a not-a-working-tree read closes an open diff', async () => {
    const h = harness();
    const first = h.store.refresh();
    h.reads[0]?.resolve(readOf([file('a')]));
    await first;
    h.store.openDiff(file('a'));
    expect(h.store.fileDiff.current).not.toBeNull();
    const second = h.store.refresh();
    h.reads[1]?.reject(new ChangesReadError({ kind: 'notAGitWorkingTree' }));
    await second;
    expect(h.store.getState().phase).toEqual({
      kind: 'readFailed',
      reason: { kind: 'notAGitWorkingTree' },
    });
    expect(h.store.fileDiff.current).toBeNull();
  });

  it('another git failure keeps an open diff', async () => {
    const h = harness();
    const first = h.store.refresh();
    h.reads[0]?.resolve(readOf([file('a')]));
    await first;
    h.store.openDiff(file('a'));
    const second = h.store.refresh();
    h.reads[1]?.reject(new ChangesReadError({ kind: 'incomplete' }));
    await second;
    expect(h.store.fileDiff.current).not.toBeNull();
  });

  it('a git timeout keeps the last document; without one it is its own phase', async () => {
    const h = harness();
    const first = h.store.refresh();
    h.reads[0]?.reject(new TransportFailure({ kind: 'gitTimedOut' }));
    await first;
    expect(h.phase()).toBe('timedOut');
    const second = h.store.refresh();
    h.reads[1]?.resolve(readOf([file('a')]));
    await second;
    const third = h.store.refresh();
    h.reads[2]?.reject(new TransportFailure({ kind: 'gitTimedOut' }));
    await third;
    expect(h.phase()).toBe('loaded');
    expect(h.store.getState().timedOutKeepingContent).toBe(true);
    const fourth = h.store.refresh();
    h.reads[3]?.resolve(readOf([file('a')]));
    await fourth;
    expect(h.store.getState().timedOutKeepingContent).toBe(false);
  });

  it('other transport failures carry their explanation', async () => {
    const h = harness();
    const first = h.store.refresh();
    h.reads[0]?.reject(new TransportFailure({ kind: 'authenticationFailed' }));
    await first;
    const phase = h.store.getState().phase;
    expect(phase.kind === 'failed' && phase.message.length > 0).toBe(true);
  });

  it('a reply that lands after cancel is ignored', async () => {
    const h = harness();
    const first = h.store.refresh();
    h.store.cancel();
    h.reads[0]?.resolve(readOf([file('a')]));
    await first;
    expect(h.phase()).toBe('loading');
    expect(h.store.getState().isRefreshing).toBe(false);
    const again = h.store.refresh();
    expect(h.reads).toHaveLength(2);
    h.reads[1]?.resolve(readOf([]));
    await again;
    expect(h.phase()).toBe('loaded');
  });

  it('a successful read collapses expanded untracked directories', async () => {
    const h = harness();
    const first = h.store.refresh();
    h.reads[0]?.resolve(readOf([makeFile('dir/', 'untracked')]));
    await first;
    await h.store.toggleDirectory(makeFile('dir/', 'untracked'));
    expect(h.store.untrackedDirectories.expansion('dir/')?.kind).toBe('failed');
    const second = h.store.refresh();
    h.reads[1]?.resolve(readOf([makeFile('dir/', 'untracked')]));
    await second;
    expect(h.store.untrackedDirectories.expansion('dir/')).toBeUndefined();
  });

  it('serializes its reads with lazy reads through the Host gate', async () => {
    const gate = new ExecGate();
    const h = harness({ gate });
    const other = harness({ gate });
    const a = h.store.refresh();
    const b = other.store.refresh();
    await h.clock.flush();
    expect(h.reads).toHaveLength(1);
    expect(other.reads).toHaveLength(0);
    h.reads[0]?.resolve(readOf([]));
    await a;
    await Promise.resolve();
    expect(other.reads).toHaveLength(1);
    other.reads[0]?.resolve(readOf([]));
    await b;
  });
});
