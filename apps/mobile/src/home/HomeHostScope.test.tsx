import { ThemeProvider } from '@openagentspocket/ui';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { createDemoConsoleStore } from '../console/demo';
import { ConsoleStoreProvider } from '../console/hooks';
import { HomeScreen } from './HomeScreen';

async function renderTwoHosts() {
  const store = createDemoConsoleStore(undefined, undefined, true);
  await render(
    <ThemeProvider themeId="indigo">
      <ConsoleStoreProvider store={store}>
        <HomeScreen />
      </ConsoleStoreProvider>
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('host-lab')).toBeTruthy());
  return store;
}

describe('Home with two Hosts', () => {
  it('keeps All Agents and Sessions in the Host menu, not as bar buttons', async () => {
    await renderTwoHosts();
    expect(screen.queryByLabelText('All Agents')).toBeNull();
    expect(screen.queryByLabelText('Sessions')).toBeNull();
    expect(screen.getByTestId('home-host-scope')).toBeTruthy();
  });

  it('offers the Host scope and starts on every Host', async () => {
    await renderTwoHosts();
    expect(screen.getByTestId('home-host-scope-capsule')).toBeTruthy();
    expect(screen.getByTestId('host-demo')).toBeTruthy();
  });

  it('narrows to the chosen Host and comes back', async () => {
    const store = await renderTwoHosts();
    await act(async () => store.listPrefs.setHostId('lab'));
    expect(screen.queryByTestId('host-demo')).toBeNull();
    expect(screen.getByTestId('host-lab')).toBeTruthy();
    await act(async () => store.listPrefs.setHostId(undefined));
    expect(screen.getByTestId('host-demo')).toBeTruthy();
  });

  it('shows every Host when the saved scope names a removed one', async () => {
    const store = await renderTwoHosts();
    await act(async () => store.listPrefs.setHostId('gone'));
    expect(screen.getByTestId('host-demo')).toBeTruthy();
    expect(screen.getByTestId('host-lab')).toBeTruthy();
  });
});
