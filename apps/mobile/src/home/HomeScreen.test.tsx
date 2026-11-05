import { AgentStatusClocks, MemoryStorage, PinnedAgents } from '@openagentspocket/core';
import { setLocale, translate } from '@openagentspocket/i18n';
import { systemClock } from '@openagentspocket/transport';
import { ThemeProvider } from '@openagentspocket/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { ConsoleStoreProvider } from '../console/hooks';
import { ConsoleStore } from '../console/store';
import { HomeScreen } from './HomeScreen';

const renderHome = (props: Parameters<typeof HomeScreen>[0] = {}) =>
  render(
    <ThemeProvider themeId="indigo">
      <HomeScreen {...props} />
    </ThemeProvider>,
  );

describe('HomeScreen', () => {
  afterEach(() => {
    setLocale('en');
  });

  it('lists the inbox sections with the demo Agents in the right one', async () => {
    await renderHome();
    await waitFor(() => expect(screen.getByTestId('inbox-p1')).toBeTruthy());
    expect(screen.getByTestId('inbox-p2')).toBeTruthy();
    expect(screen.getByTestId('inbox-p4')).toBeTruthy();
    expect(screen.getByTestId('host-demo')).toBeTruthy();
  });

  it('shows a status age on each inbox card', async () => {
    await renderHome();
    await waitFor(() => expect(screen.getByTestId('inbox-p1-age')).toBeTruthy());
  });

  it('opens the Agent when its card is tapped', async () => {
    const onOpenAgent = jest.fn();
    await renderHome({ onOpenAgent });
    await waitFor(() => expect(screen.getByTestId('inbox-p1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('inbox-p1'));
    expect(onOpenAgent).toHaveBeenCalledTimes(1);
  });

  it('opens a Host from its card', async () => {
    const onOpenHost = jest.fn();
    await renderHome({ onOpenHost });
    await waitFor(() => expect(screen.getByTestId('host-demo')).toBeTruthy());
    fireEvent.press(screen.getByTestId('host-demo'));
    expect(onOpenHost).toHaveBeenCalledWith('demo');
  });

  it('titles the sections from the catalog of the current locale', async () => {
    setLocale('es');
    await renderHome();
    await waitFor(() => expect(screen.getByTestId('inbox-p1')).toBeTruthy());
    for (const key of ['Needs you', 'Working', 'Done']) {
      const spanish = translate('es', 'app', key);
      expect(spanish).not.toBe(translate('en', 'app', key));
      expect(screen.getByText(spanish)).toBeTruthy();
    }
  });

  it('opens the + sheet with New Agent, New Terminal and Add Host', async () => {
    // On iOS a choice runs once the sheet has left (Modal onDismiss, never fired in Jest).
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
    const onNewAgent = jest.fn();
    await renderHome({ onNewAgent });
    fireEvent.press(await screen.findByTestId('fab'));
    fireEvent.press(await screen.findByText(translate('en', 'app', 'New Agent')));
    await waitFor(() => expect(onNewAgent).toHaveBeenCalledTimes(1));
  });

  it('leads a first run with no Hosts to adding one', async () => {
    const onAddHost = jest.fn();
    const empty = new ConsoleStore({
      pins: new PinnedAgents(new MemoryStorage()),
      clocks: new AgentStatusClocks(new MemoryStorage()),
      clock: systemClock,
    });
    await render(
      <ThemeProvider themeId="indigo">
        <ConsoleStoreProvider store={empty}>
          <HomeScreen onAddHost={onAddHost} />
        </ConsoleStoreProvider>
      </ThemeProvider>,
    );
    fireEvent.press(await screen.findByTestId('home-add-host'));
    expect(onAddHost).toHaveBeenCalledTimes(1);
  });
});
