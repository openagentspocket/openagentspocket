import {
  HerdrApiError,
  MemoryStorage,
  SettingsStore,
  type ShellTerminalRemote,
} from '@openagentspocket/core';
import { OverlayHost, ThemeProvider } from '@openagentspocket/ui';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { fakeAuthenticator } from '@/settings/authenticator';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { createDemoShellServices } from './demo';
import { ShellTerminalScreen } from './ShellTerminalScreen';
import { type ShellTerminalServices, ShellTerminalServicesProvider } from './services';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));

const pools: Array<ShellTerminalServices['pool']> = [];

afterEach(async () => {
  await cleanup();
  // Idle expiry timers must not outlive the test.
  await Promise.all(pools.splice(0).map((pool) => pool.suspend()));
});

async function renderShell(
  props: Partial<Parameters<typeof ShellTerminalScreen>[0]> = {},
  services: ShellTerminalServices = createDemoShellServices(),
) {
  const onClose = jest.fn();
  pools.push(services.pool);
  const view = await render(
    <ShellTerminalServicesProvider services={services}>
      <ThemeProvider themeId="indigo">
        <SettingsProvider
          store={new SettingsStore(new MemoryStorage())}
          authenticator={fakeAuthenticator(null)}
        >
          <OverlayHost />
          <ShellTerminalScreen hostId="h1" cwd="/work/app" onClose={onClose} {...props} />
        </SettingsProvider>
      </ThemeProvider>
    </ShellTerminalServicesProvider>,
  );
  return { onClose, services, view };
}

describe('ShellTerminalScreen', () => {
  it('opens a shell in the directory and retains it in the pool', async () => {
    const { services } = await renderShell();
    await screen.findByTestId('shell-terminal');
    expect(services.pool.retained('h1')).toHaveLength(1);
  });

  it('refuses a missing or relative directory without creating anything', async () => {
    const created = jest.fn();
    const services = createDemoShellServices();
    const remote: ShellTerminalRemote = { ...services.remote('h1'), create: created };
    await renderShell({ cwd: 'relative' }, { ...services, remote: () => remote });
    await screen.findByTestId('shell-no-directory');
    expect(created).not.toHaveBeenCalled();
  });

  it('shows the failure and offers Try Again; a rejection never reads as ambiguous', async () => {
    const services = createDemoShellServices();
    let attempts = 0;
    const real = services.remote('h1');
    const remote: ShellTerminalRemote = {
      ...real,
      create: async (request) => {
        attempts += 1;
        if (attempts === 1) throw new HerdrApiError('invalid', 'no such workspace');
        return real.create(request);
      },
    };
    await renderShell({}, { ...services, remote: () => remote });
    await screen.findByTestId('shell-failed');
    await fireEvent.press(screen.getByTestId('shell-retry'));
    await screen.findByTestId('shell-terminal');
    expect(attempts).toBe(2);
  });

  it('leaving a screen keeps the shell pooled; coming back reuses the same tab', async () => {
    const services = createDemoShellServices();
    const first = await renderShell({}, services);
    await screen.findByTestId('shell-terminal');
    const [identity] = services.pool.retained('h1');
    await first.view.unmount();
    expect(services.pool.size).toBe(1);
    await renderShell({}, services);
    await screen.findByTestId('shell-terminal');
    expect(services.pool.retained('h1')).toEqual([identity]);
  });

  it('Close Terminal asks, closes the tab, drops it from the pool and leaves', async () => {
    const services = createDemoShellServices();
    const close = jest.spyOn(services.remote('h1'), 'close');
    const { onClose } = await renderShell({}, services);
    await screen.findByTestId('shell-terminal');
    await fireEvent.press(screen.getByTestId('shell-close'));
    const confirmButton = await screen.findByTestId('alert-action-confirm');
    await fireEvent.press(confirmButton);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(close).toHaveBeenCalledTimes(1);
    expect(services.pool.size).toBe(0);
  });
});
