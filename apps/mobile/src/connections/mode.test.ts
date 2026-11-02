import { MemoryStorage } from '@openagentspocket/core';
import {
  bindDemoModeStorage,
  isDemoMode,
  isDemoModeForced,
  setDemoMode,
  setDemoModeSetting,
  subscribeDemoMode,
} from './mode';

describe('demo mode', () => {
  afterEach(() => {
    setDemoMode(undefined);
    bindDemoModeStorage(undefined);
  });

  it('remembers the Settings switch and tells subscribers', () => {
    bindDemoModeStorage(new MemoryStorage());
    const listener = jest.fn();
    const stop = subscribeDemoMode(listener);
    expect(isDemoMode()).toBe(false);
    setDemoModeSetting(true);
    expect(isDemoMode()).toBe(true);
    expect(listener).toHaveBeenCalled();
    setDemoModeSetting(false);
    expect(isDemoMode()).toBe(false);
    stop();
  });

  it('lets an override beat the stored switch and lock it', () => {
    bindDemoModeStorage(new MemoryStorage());
    setDemoModeSetting(true);
    setDemoMode(false);
    expect(isDemoMode()).toBe(false);
    expect(isDemoModeForced()).toBe(true);
  });
});
