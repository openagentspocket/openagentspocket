import { MemoryStorage, SettingsStore } from '@openagentspocket/core';
import { ThemeProvider } from '@openagentspocket/ui';
import { act, render, screen } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { AppLockCover } from './AppLockCover';
import { AppLockProvider } from './AppLockProvider';
import { fakeAuthenticator, guardAuthenticator } from './authenticator';
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

async function mountLock(
  lockOn: boolean,
  authSucceeds: boolean,
  authenticator = fakeAuthenticator('Face ID', authSucceeds),
  grace?: 'immediately' | 'oneMinute',
) {
  const store = new SettingsStore(new MemoryStorage());
  store.update({ appLockEnabled: lockOn, ...(grace ? { appLockGrace: grace } : {}) });
  const emit = captureAppState();
  await render(
    <ThemeProvider themeId="indigo">
      <SettingsProvider store={store} authenticator={authenticator}>
        <AppLockProvider>
          <AppLockCover />
        </AppLockProvider>
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

    await act(async () => emit('background'));
    expect(screen.getByTestId('app-lock-cover')).toBeTruthy();
    await act(async () => emit('active'));
    // The default grace is immediate, so returning locks and prompts, which succeeds.
    await act(async () => undefined);
    expect(screen.queryByTestId('app-lock-cover')).toBeNull();
  });

  it('does not relock when its own prompt makes the app inactive and active', async () => {
    let emit: (state: AppStateStatus) => void = () => undefined;
    let prompts = 0;
    const authenticator = fakeAuthenticator('Face ID', true, () => {
      prompts += 1;
      emit('inactive');
      emit('active');
    });
    emit = await mountLock(true, true, authenticator);
    await act(async () => undefined);
    expect(prompts).toBe(1);
    expect(screen.queryByTestId('app-lock-cover')).toBeNull();
    await act(async () => undefined);
    expect(prompts).toBe(1);
  });

  it('inactive alone covers but does not start the grace period', async () => {
    const emit = await mountLock(true, true, undefined, 'immediately');
    await act(async () => undefined);
    await act(async () => emit('inactive'));
    expect(screen.getByTestId('app-lock-cover')).toBeTruthy();
    expect(screen.queryByTestId('app-lock-unlock')).toBeNull();
    await act(async () => emit('active'));
    await act(async () => undefined);
    expect(screen.queryByTestId('app-lock-cover')).toBeNull();
    expect(screen.queryByTestId('app-lock-unlock')).toBeNull();
  });

  it('shows the denied message and the unlock button when the owner is not confirmed', async () => {
    await mountLock(true, false);
    await act(async () => undefined);
    expect(screen.getByTestId('app-lock-message')).toBeTruthy();
  });

  it('treats a throwing prompt as not unlocked', async () => {
    const authenticator = guardAuthenticator(
      () => Promise.resolve('Face ID'),
      () => Promise.reject(new Error('boom')),
    );
    await mountLock(true, true, authenticator);
    await act(async () => undefined);
    expect(screen.getByTestId('app-lock-unlock')).toBeTruthy();
  });

  it('unlocks on return when the device lost its passcode while locked', async () => {
    let kind: string | null = 'Face ID';
    const authenticator = guardAuthenticator(
      () => Promise.resolve(kind),
      () => Promise.resolve('cancelled'),
    );
    const emit = await mountLock(true, true, authenticator);
    await act(async () => undefined);
    expect(screen.getByTestId('app-lock-unlock')).toBeTruthy();
    kind = null;
    await act(async () => emit('active'));
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
