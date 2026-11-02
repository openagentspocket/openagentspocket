import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../hosts/known-hosts';
import { PINNED_AGENTS_STORAGE_KEY, PinnedAgents } from './pins';

describe('PinnedAgents', () => {
  it('persists across instances, most recent first, and counts revisions', () => {
    const storage = new MemoryStorage();
    const pins = new PinnedAgents(storage);
    pins.togglePin('h', 'w1:p1');
    pins.togglePin('h', 'w1:p2');
    expect(pins.revision).toBe(2);

    const reloaded = new PinnedAgents(storage);
    expect(reloaded.pinnedPaneIds('h')).toEqual(['w1:p2', 'w1:p1']);
    expect(reloaded.pinRank('h', 'w1:p2')).toBe(0);
    expect(reloaded.pinRank('h', 'w1:p1')).toBe(1);
  });

  it('toggles a pin on and off', () => {
    const storage = new MemoryStorage();
    const pins = new PinnedAgents(storage);
    expect(pins.isPinned('h', 'p')).toBe(false);
    expect(pins.pinRank('h', 'p')).toBeUndefined();
    pins.togglePin('h', 'p');
    expect(pins.isPinned('h', 'p')).toBe(true);
    pins.togglePin('h', 'p');
    expect(pins.isPinned('h', 'p')).toBe(false);
    expect(new PinnedAgents(storage).pinnedPaneIds('h')).toEqual([]);
  });

  it('moves a re-pinned entry to most recent', () => {
    const pins = new PinnedAgents();
    pins.togglePin('h', 'p1');
    pins.togglePin('h', 'p2');
    pins.togglePin('h', 'p1');
    pins.togglePin('h', 'p1');
    expect(pins.pinnedPaneIds('h')).toEqual(['p1', 'p2']);
  });

  it('ranks across Hosts in one list but lists per Host', () => {
    const pins = new PinnedAgents();
    pins.togglePin('a', 'w1:p1');
    pins.togglePin('b', 'w1:p1');
    pins.togglePin('b', 'w2:p9');
    expect(pins.pinnedPaneIds('a')).toEqual(['w1:p1']);
    expect(pins.pinnedPaneIds('b')).toEqual(['w2:p9', 'w1:p1']);
    expect(pins.pinRank('b', 'w2:p9')).toBe(0);
    expect(pins.pinRank('a', 'w1:p1')).toBe(2);
    expect(pins.isPinned('a', 'w2:p9')).toBe(false);
    expect(pins.pinnedPaneIds('nobody')).toEqual([]);
  });

  it('starts empty on malformed data and recovers on the next write', () => {
    const storage = new MemoryStorage();
    storage.set(PINNED_AGENTS_STORAGE_KEY, 'not json');
    const pins = new PinnedAgents(storage);
    expect(pins.pinnedPaneIds('h')).toEqual([]);
    pins.togglePin('h', 'p');
    expect(new PinnedAgents(storage).isPinned('h', 'p')).toBe(true);
  });

  it('starts empty on an unknown version', () => {
    const storage = new MemoryStorage();
    storage.set(
      PINNED_AGENTS_STORAGE_KEY,
      JSON.stringify({ version: 99, entries: [{ hostId: 'h', paneId: 'p' }] }),
    );
    expect(new PinnedAgents(storage).isPinned('h', 'p')).toBe(false);
  });

  it('keeps an entry for a pane that no longer exists until it is unpinned', () => {
    const storage = new MemoryStorage();
    new PinnedAgents(storage).togglePin('h', 'gone:pane');
    const reloaded = new PinnedAgents(storage);
    expect(reloaded.pinnedPaneIds('h')).toEqual(['gone:pane']);
    reloaded.removePin('h', 'gone:pane');
    expect(reloaded.pinnedPaneIds('h')).toEqual([]);
    const revision = reloaded.revision;
    reloaded.removePin('h', 'gone:pane');
    expect(reloaded.revision).toBe(revision);
  });

  describe('movePin', () => {
    const pinned = (...ids: string[]) => {
      const storage = new MemoryStorage();
      const pins = new PinnedAgents(storage);
      for (const id of [...ids].reverse()) pins.togglePin('h', id);
      return { pins, storage };
    };

    it('swaps with the neighbor and persists the order', () => {
      const { pins, storage } = pinned('a', 'b', 'c');
      expect(pins.movePin('h', 'c', 'up')).toBe(true);
      expect(pins.pinnedPaneIds('h')).toEqual(['a', 'c', 'b']);
      expect(pins.movePin('h', 'a', 'down')).toBe(true);
      expect(new PinnedAgents(storage).pinnedPaneIds('h')).toEqual(['c', 'a', 'b']);
    });

    it('stops at the ends and ignores unpinned panes', () => {
      const { pins } = pinned('a', 'b');
      const before = pins.revision;
      expect(pins.movePin('h', 'a', 'up')).toBe(false);
      expect(pins.movePin('h', 'b', 'down')).toBe(false);
      expect(pins.movePin('h', 'zz', 'up')).toBe(false);
      expect(pins.revision).toBe(before);
    });

    it('movePinTo drops a pin on another pin and persists', () => {
      const { pins, storage } = pinned('a', 'b', 'c', 'd');
      expect(pins.movePinTo('h', 'a', { hostId: 'h', paneId: 'c' })).toBe(true);
      expect(pins.pinnedPaneIds('h')).toEqual(['b', 'c', 'a', 'd']);
      expect(pins.movePinTo('h', 'd', { hostId: 'h', paneId: 'b' })).toBe(true);
      expect(new PinnedAgents(storage).pinnedPaneIds('h')).toEqual(['d', 'b', 'c', 'a']);
      const before = pins.revision;
      expect(pins.movePinTo('h', 'a', { hostId: 'h', paneId: 'a' })).toBe(false);
      expect(pins.movePinTo('h', 'zz', { hostId: 'h', paneId: 'a' })).toBe(false);
      expect(pins.revision).toBe(before);
    });

    it('skips pins of panes that are no longer listed', () => {
      const { pins } = pinned('a', 'gone', 'c');
      const listed = (_host: string, pane: string) => pane !== 'gone';
      expect(pins.movePin('h', 'c', 'up', listed)).toBe(true);
      expect(pins.pinnedPaneIds('h')).toEqual(['c', 'gone', 'a']);
    });
  });
});
