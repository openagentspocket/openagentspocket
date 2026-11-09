import { ThemeProvider } from '@openagentspocket/ui';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { createDemoConsoleStore } from '@/console/demo';
import { ConsoleStoreProvider } from '@/console/hooks';
import { HostScopeNotice } from './HostScopeNotice';

const show = (store: ReturnType<typeof createDemoConsoleStore>) =>
  render(
    <ThemeProvider themeId="indigo">
      <ConsoleStoreProvider store={store}>
        <HostScopeNotice />
      </ConsoleStoreProvider>
    </ThemeProvider>,
  );

describe('HostScopeNotice', () => {
  it('draws nothing while every Host shows', async () => {
    await show(createDemoConsoleStore());
    expect(screen.queryByTestId('host-scope-notice')).toBeNull();
  });

  it('says the list shows one Host, says when it has no Agents, and clears the filter', async () => {
    const store = createDemoConsoleStore(undefined, undefined, true);
    const lab = store.getState().hosts.find((host) => host.id !== 'demo');
    if (!lab) throw new Error('the demo store needs a second Host');
    store.listPrefs.setHostId(lab.id);
    await show(store);
    expect(screen.getByTestId('host-scope-notice')).toBeTruthy();
    await fireEvent.press(screen.getByText('Show All Hosts'));
    expect(store.listPrefs.hostId).toBeUndefined();
  });
});
