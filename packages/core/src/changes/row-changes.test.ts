import { describe, expect, it } from 'vitest';
import { gitStatusOf, gitStatusOfState } from './git-status';
import { ROW_CHANGES_INTERVAL_MS, RowChanges } from './row-changes';
import { changesOf, file, harness, readOf } from './store-harness';
import { APPEARANCE_SETTLE_MS } from './store-types';

const target = { hostId: 'h', directory: '/r/app', paneId: 'p1' };

function setup() {
  const h = harness();
  let made = 0;
  const rows = new RowChanges({
    make: () => {
      made += 1;
      return h.store;
    },
    clock: h.clock,
  });
  return { h, rows, made: () => made };
}

describe('RowChanges', () => {
  it('reads once the row has settled, and shares one store between watchers', async () => {
    const { h, rows, made } = setup();
    const first = rows.watch(target);
    const second = rows.watch(target);
    expect(made()).toBe(1);
    expect(first?.store).toBe(second?.store);
    expect(h.reads).toHaveLength(0);
    await h.clock.advance(APPEARANCE_SETTLE_MS);
    expect(h.reads).toHaveLength(1);
    h.reads[0]?.resolve(readOf([file('a')]));
    await h.clock.flush();
    expect(gitStatusOfState(h.store.getState())?.changed).toBe(1);
  });

  it('re-reads on the interval while watched and stops when the last watcher leaves', async () => {
    const { h, rows } = setup();
    const watch = rows.watch(target);
    await h.clock.advance(APPEARANCE_SETTLE_MS);
    h.reads[0]?.resolve(readOf([file('a')]));
    await h.clock.flush();
    await h.clock.advance(ROW_CHANGES_INTERVAL_MS);
    expect(h.reads).toHaveLength(2);
    h.reads[1]?.resolve(readOf([file('a')]));
    await h.clock.flush();
    watch?.release();
    await h.clock.advance(ROW_CHANGES_INTERVAL_MS * 2);
    expect(h.reads).toHaveLength(2);
  });

  it('follows the Agent: an exit from Working reads once while watched', async () => {
    const { h, rows } = setup();
    rows.watch(target);
    await h.clock.advance(APPEARANCE_SETTLE_MS);
    h.reads[0]?.resolve(readOf([file('a')]));
    await h.clock.flush();
    h.status('working');
    h.status('idle');
    await h.clock.advance(1_000);
    expect(h.reads).toHaveLength(2);
    h.reads[1]?.resolve(readOf([file('a')]));
    await h.clock.flush();
  });

  it('makes no watch for a target the factory cannot read', () => {
    const rows = new RowChanges({ make: () => null, clock: harness().clock });
    expect(rows.watch(target)).toBeNull();
  });
});

describe('gitStatusOf', () => {
  it('counts branch, upstream, files and lines', () => {
    const changes = changesOf([file('a'), { ...file('b'), kind: 'conflicted', staging: null }]);
    const status = gitStatusOf({
      ...changes,
      head: {
        ...changes.head,
        upstream: { name: 'origin/main', state: { kind: 'tracking', ahead: 2, behind: 1 } },
      },
      totals: { ...changes.totals, untrackedItems: 3, added: 7, removed: 4 },
    });
    expect(status).toMatchObject({
      branch: 'main',
      ahead: 2,
      behind: 1,
      changed: 1,
      staged: 0,
      untracked: 3,
      conflicts: 1,
      diff: { added: 7, removed: 4 },
    });
  });

  it('has no diff when git could not count lines and no branch when detached', () => {
    const changes = changesOf([]);
    const status = gitStatusOf({
      ...changes,
      head: { ...changes.head, branch: { kind: 'detached' } },
      totals: { ...changes.totals, linesAreAvailable: false },
    });
    expect(status.branch).toBeNull();
    expect(status.isDetached).toBe(true);
    expect(status.diff).toBeUndefined();
  });
});
