import { MemoryStorage, SettingsStore } from '@openagentspocket/core';
import { ThemeProvider } from '@openagentspocket/ui';
import { act, render, screen } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { AppLockCover } from './AppLockCover';
import { fakeAuthenticator } from './authenticator';
import { SettingsProvider } from './SettingsProvider';

type StateListener = (state: AppStateStatus) => void;

function captureAppState() {
  const listeners: StateListener[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    listeners.push(listener);
    return { remove: () => undefined };
  });
  return (state: AppStateStatus) => {
    for (const listener of listeners) listener(state);
  };
}

async function mountLock(lockOn: boolean, authSucceeds: boolean) {
  const store = new SettingsStore(new MemoryStorage());
  store.update({ appLockEnabled: lockOn });
  const emit = captureAppState();
  await render(
    <ThemeProvider themeId="indigo">
      <SettingsProvider store={store} authenticator={fakeAuthenticator('Face ID', authSucceeds)}>
        <AppLockCover />
      </SettingsProvider>
    </ThemeProvider>,
  );
  return emit;
}

describe('AppLockCover', () => {
  afterEach(() => jest.restoreAllMocks());

  it('shows nothing while the lock is off, even in the background', async () => {
    const emit = await mountLock(false, true);
    await act(async () => emit('background'));
    expect(screen.queryByTestId('app-lock-cover')).toBeNull();
  });

  it('covers at launch until the owner unlocks, then again after leaving the app', async () => {
    const emit = await mountLock(true, true);
    await act(async () => undefined);
    expect(screen.queryByTestId('app-lock-cover')).toBeNull();

    await act(async () => emit('inactive'));
    expect(screen.getByTestId('app-lock-cover')).toBeTruthy();
    await act(async () => emit('active'));
    // The default grace is immediate, so returning locks and prompts, which succeeds.
    await act(async () => undefined);
    expect(screen.queryByTestId('app-lock-cover')).toBeNull();
  });

  it('stays covered, with an unlock button, when authentication fails', async () => {
    await mountLock(true, false);
    await act(async () => undefined);
    expect(screen.getByTestId('app-lock-cover')).toBeTruthy();
    expect(screen.getByTestId('app-lock-unlock')).toBeTruthy();
  });
});
