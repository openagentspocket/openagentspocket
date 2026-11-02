import { describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../hosts/known-hosts';
import { AppLockGate, locksOnReturn } from './app-lock';
import { formatByteCount } from './chat-cache';
import { SETTINGS_DEFAULTS, SETTINGS_STORAGE_KEY, SettingsStore } from './preferences';
import { resolveThemeId, themeSelectionPatch, themeSlot } from './theme-choice';

describe('SettingsStore', () => {
  it('starts at the defaults and persists changes across instances', () => {
    const storage = new MemoryStorage();
    const store = new SettingsStore(storage);
    expect(store.snapshot()).toEqual(SETTINGS_DEFAULTS);
    store.set('theme', 'noche');
    expect(new SettingsStore(storage).get('theme')).toBe('noche');
  });

  it('falls back per key on unusable stored values and clamps numbers', () => {
    const storage = new MemoryStorage();
    storage.set(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        theme: 'nope',
        chatTextOffset: 99,
        terminalFontSize: 'x',
        foldFinishedTurns: false,
      }),
    );
    const store = new SettingsStore(storage);
    expect(store.get('theme')).toBe(SETTINGS_DEFAULTS.theme);
    expect(store.get('chatTextOffset')).toBe(3);
    expect(store.get('terminalFontSize')).toBe(SETTINGS_DEFAULTS.terminalFontSize);
    expect(store.get('foldFinishedTurns')).toBe(false);
  });

  it('survives corrupt storage and keeps unknown keys on write', () => {
    const corrupt = new MemoryStorage();
    corrupt.set(SETTINGS_STORAGE_KEY, '{oops');
    expect(new SettingsStore(corrupt).snapshot()).toEqual(SETTINGS_DEFAULTS);

    const storage = new MemoryStorage();
    storage.set(SETTINGS_STORAGE_KEY, JSON.stringify({ future: 1 }));
    new SettingsStore(storage).set('followSystem', true);
    expect(JSON.parse(storage.getString(SETTINGS_STORAGE_KEY) ?? '{}')).toMatchObject({
      future: 1,
      followSystem: true,
    });
  });

  it('rejects a theme in the wrong slot and notifies only on real changes', () => {
    const store = new SettingsStore(new MemoryStorage());
    const listener = vi.fn();
    store.subscribe(listener);
    store.set('lightTheme', 'noche');
    expect(store.get('lightTheme')).toBe('papel');
    expect(listener).not.toHaveBeenCalled();
    const before = store.snapshot();
    store.set('toolbarTab', false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.snapshot()).not.toBe(before);
  });

  it('resets chosen keys', () => {
    const store = new SettingsStore(new MemoryStorage());
    store.update({ toolbarTab: false, toolbarHaptics: false, theme: 'papel' });
    store.reset(['toolbarTab', 'toolbarHaptics']);
    expect(store.get('toolbarTab')).toBe(true);
    expect(store.get('theme')).toBe('papel');
  });
});

describe('theme choice', () => {
  const follow = { ...SETTINGS_DEFAULTS, followSystem: true };

  it('resolves the chosen theme, or the pair slot of the system scheme', () => {
    expect(resolveThemeId({ ...SETTINGS_DEFAULTS, theme: 'papel' }, 'dark')).toBe('papel');
    expect(resolveThemeId(follow, 'dark')).toBe('indigo');
    expect(resolveThemeId(follow, 'light')).toBe('papel');
  });

  it('fills the slot of the theme appearance when following the system', () => {
    expect(themeSelectionPatch(SETTINGS_DEFAULTS, 'noche')).toEqual({ theme: 'noche' });
    expect(themeSelectionPatch(follow, 'noche')).toEqual({ darkTheme: 'noche' });
    expect(themeSelectionPatch(follow, 'papel')).toEqual({ lightTheme: 'papel' });
    expect(themeSlot(follow, 'indigo')).toBe('dark');
    expect(themeSlot(follow, 'noche')).toBeNull();
    expect(themeSlot(SETTINGS_DEFAULTS, 'indigo')).toBeNull();
  });
});

describe('app lock', () => {
  it('locks on return only after the grace period', () => {
    expect(locksOnReturn('immediately', 0, 0)).toBe(true);
    expect(locksOnReturn('oneMinute', 0, 59_999)).toBe(false);
    expect(locksOnReturn('oneMinute', 0, 60_000)).toBe(true);
    expect(locksOnReturn('fifteenMinutes', 1000, 0)).toBe(true);
  });

  it('is locked at launch, covers while away and relocks after the grace', () => {
    const gate = new AppLockGate(true, 'oneMinute');
    expect(gate.locked).toBe(true);
    gate.unlock();
    gate.deactivate(0);
    expect(gate.covered).toBe(true);
    gate.activate(30_000);
    expect(gate.covered).toBe(false);
    expect(gate.locked).toBe(false);
    gate.deactivate(40_000);
    gate.deactivate(50_000);
    gate.activate(100_000);
    expect(gate.locked).toBe(true);
  });

  it('does nothing while off', () => {
    const gate = new AppLockGate(false, 'immediately');
    gate.deactivate(0);
    gate.activate(1);
    expect(gate.covered || gate.locked).toBe(false);
  });
});

describe('formatByteCount', () => {
  it('picks decimal units', () => {
    expect(formatByteCount(0)).toEqual({ value: 0, unit: 'bytes' });
    expect(formatByteCount(1500)).toEqual({ value: 1.5, unit: 'KB' });
    expect(formatByteCount(12_340_000)).toEqual({ value: 12.3, unit: 'MB' });
  });
});
