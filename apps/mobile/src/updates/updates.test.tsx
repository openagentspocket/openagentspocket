import { MemoryStorage, SettingsStore } from '@openagentspocket/core';
import { act, render } from '@testing-library/react-native';
import { appBuild } from '@/diagnostics/appBuild';
import { problemReportBody } from '@/diagnostics/problemReport';
import { fakeAuthenticator } from '@/settings/authenticator';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { type AppUpdates, createAppUpdates, disabledUpdates, fakeUpdatesApi } from './appUpdates';
import { deviceUpdates } from './deviceUpdates';
import { UpdateChannelSync } from './UpdateChannelSync';

const ID = '0f6a2b3c-1d2e-4f50-8a9b-0c1d2e3f4a5b';

describe('app updates', () => {
  it('is off without the native module or with updates disabled in the build', () => {
    expect(createAppUpdates(null)).toBe(disabledUpdates);
    expect(createAppUpdates(fakeUpdatesApi({ isEnabled: false })).enabled).toBe(false);
  });

  it('is off in tests, as in every build but an official store one', () => {
    expect(deviceUpdates.enabled).toBe(false);
  });

  it('beta sets the channel param, production removes it', async () => {
    const api = fakeUpdatesApi();
    const updates = createAppUpdates(api);
    await updates.setChannel('beta');
    expect(api.params.get('channel')).toBe('beta');
    await updates.setChannel('production');
    expect(api.params.has('channel')).toBe(false);
  });

  it('a refused channel change does not throw', async () => {
    const api = fakeUpdatesApi({ setExtraParamAsync: () => Promise.reject(new Error('no')) });
    await expect(createAppUpdates(api).setChannel('beta')).resolves.toBeUndefined();
  });

  it('reads what runs from expo-updates', () => {
    const createdAt = new Date('2026-11-14T00:00:00.000Z');
    const api = fakeUpdatesApi({ isEmbeddedLaunch: false, updateId: ID, createdAt });
    expect(createAppUpdates(api).running()).toEqual({ embedded: false, id: ID, createdAt });
  });
});

describe('the problem report names the running update only in a build with updates', () => {
  it('leaves it out without updates', () => {
    const build = appBuild(disabledUpdates);
    expect(build.update).toBeUndefined();
    expect(problemReportBody(build)).not.toMatch(/Update:/);
  });

  it('names the embedded JS or the update short id', () => {
    const embedded = appBuild(createAppUpdates(fakeUpdatesApi()));
    expect(embedded.update).toMatch(/embedded/);
    const api = fakeUpdatesApi({ isEmbeddedLaunch: false, updateId: ID, createdAt: new Date() });
    expect(problemReportBody(appBuild(createAppUpdates(api)))).toContain('0f6a2b3c');
  });
});

describe('UpdateChannelSync', () => {
  async function mount(updates: AppUpdates) {
    const store = new SettingsStore(new MemoryStorage());
    await render(
      <SettingsProvider store={store} authenticator={fakeAuthenticator(null)} updates={updates}>
        <UpdateChannelSync />
      </SettingsProvider>,
    );
    return store;
  }

  it('applies the channel at launch and on every toggle', async () => {
    const api = fakeUpdatesApi();
    const setParam = jest.spyOn(api, 'setExtraParamAsync');
    const store = await mount(createAppUpdates(api));
    expect(setParam).toHaveBeenLastCalledWith('channel', null);
    await act(async () => store.set('earlyUpdates', true));
    expect(api.params.get('channel')).toBe('beta');
    await act(async () => store.set('earlyUpdates', false));
    expect(api.params.has('channel')).toBe(false);
  });

  it('touches nothing in a build without updates', async () => {
    const setChannel = jest.spyOn(disabledUpdates, 'setChannel');
    const store = await mount(disabledUpdates);
    await act(async () => store.set('earlyUpdates', true));
    expect(setChannel).not.toHaveBeenCalled();
  });
});
