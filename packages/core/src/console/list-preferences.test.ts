import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../hosts/known-hosts';
import { ListPreferences } from './list-preferences';

describe('ListPreferences', () => {
  it('starts flat, unfiltered, with Idle folded', () => {
    const prefs = new ListPreferences(new MemoryStorage());
    expect(prefs.presentation).toBe('flat');
    expect(prefs.hostId).toBeUndefined();
    expect([...prefs.collapsed]).toEqual(['idle']);
  });

  it('persists presentation, Host filter and folds across instances', () => {
    const storage = new MemoryStorage();
    const prefs = new ListPreferences(storage);
    prefs.setPresentation('byHost');
    prefs.setHostId('h1');
    prefs.toggleCollapsed('idle');
    prefs.toggleCollapsed('h2');
    const again = new ListPreferences(storage);
    expect(again.presentation).toBe('byHost');
    expect(again.hostId).toBe('h1');
    expect([...again.collapsed]).toEqual(['h2']);
  });

  it('tells subscribers when the Host scope changes, and only then', () => {
    const prefs = new ListPreferences(new MemoryStorage());
    let heard = 0;
    const stop = prefs.subscribeHost(() => {
      heard += 1;
    });
    prefs.setHostId('h1');
    prefs.setHostId('h1');
    stop();
    prefs.setHostId('h2');
    expect(heard).toBe(1);
  });

  it('keeps an emptied fold set instead of restoring the Idle default', () => {
    const storage = new MemoryStorage();
    new ListPreferences(storage).toggleCollapsed('idle');
    expect(new ListPreferences(storage).collapsed.size).toBe(0);
  });

  it('clears the Host filter', () => {
    const storage = new MemoryStorage();
    const prefs = new ListPreferences(storage);
    prefs.setHostId('h1');
    prefs.setHostId(undefined);
    expect(new ListPreferences(storage).hostId).toBeUndefined();
  });

  it('ignores unknown or corrupt stored values', () => {
    const storage = new MemoryStorage();
    storage.set('console-list.presentation-mode', 'byMoon');
    storage.set('console-list.collapsed', '{nope');
    const prefs = new ListPreferences(storage);
    expect(prefs.presentation).toBe('flat');
    expect([...prefs.collapsed]).toEqual(['idle']);
  });
});
