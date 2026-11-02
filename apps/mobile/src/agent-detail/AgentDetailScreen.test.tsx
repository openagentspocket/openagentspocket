import { MemoryStorage } from '@openagentspocket/core';
import { ThemeProvider } from '@openagentspocket/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createDemoConsoleStore } from '../console/demo';
import { ConsoleStoreProvider } from '../console/hooks';
import { AgentDetailScreen } from './AgentDetailScreen';
import { parseSurface, readSurface } from './surface';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));

function renderDetail(
  props: Partial<React.ComponentProps<typeof AgentDetailScreen>> & { paneId: string },
) {
  const storage = props.storage ?? new MemoryStorage();
  const onSwitch = props.onSwitch ?? jest.fn();
  render(
    <ThemeProvider themeId="indigo">
      <AgentDetailScreen hostId="demo" storage={storage} onSwitch={onSwitch} {...props} />
    </ThemeProvider>,
  );
  return { storage, onSwitch };
}

describe('AgentDetailScreen', () => {
  it('shows the header and the Chat slot by default', async () => {
    renderDetail({ paneId: 'p2' });
    await waitFor(() => expect(screen.getByTestId('agent-header')).toBeTruthy());
    expect(screen.getByTestId('slot-chat')).toBeTruthy();
  });

  it('toggles to the terminal and persists the choice', async () => {
    const { storage } = renderDetail({ paneId: 'p2' });
    await waitFor(() => expect(screen.getByTestId('surface-terminal')).toBeTruthy());
    fireEvent.press(screen.getByTestId('surface-terminal'));
    await waitFor(() => expect(screen.getByTestId('slot-terminal')).toBeTruthy());
    expect(readSurface(storage)).toBe('terminal');
  });

  it('opens on the surface a deep link names without saving it', async () => {
    const { storage } = renderDetail({ paneId: 'p2', surface: 'terminal' });
    await waitFor(() => expect(screen.getByTestId('slot-terminal')).toBeTruthy());
    expect(readSurface(storage)).toBe('chat');
  });

  it('switches to another Agent from the strip', async () => {
    const { onSwitch } = renderDetail({ paneId: 'p2' });
    await waitFor(() => expect(screen.getByTestId('switch-p3')).toBeTruthy());
    fireEvent.press(screen.getByTestId('switch-p3'));
    expect(onSwitch).toHaveBeenCalledWith(expect.objectContaining({ hostId: 'demo' }));
  });

  it('says so when the Agent is not listed', async () => {
    renderDetail({ paneId: 'nope' });
    await waitFor(() => expect(screen.getByTestId('agent-gone')).toBeTruthy());
  });

  it('focuses a Done Agent once, and leaves a working one alone', async () => {
    const store = createDemoConsoleStore();
    const focus = jest.spyOn(store, 'focusAgent').mockResolvedValue();
    const view = (paneId: string) => (
      <ThemeProvider themeId="indigo">
        <ConsoleStoreProvider store={store}>
          <AgentDetailScreen
            hostId="demo"
            paneId={paneId}
            storage={new MemoryStorage()}
            onSwitch={jest.fn()}
          />
        </ConsoleStoreProvider>
      </ThemeProvider>
    );
    const first = await render(view('p2'));
    await waitFor(() => expect(screen.getByTestId('agent-header')).toBeTruthy());
    expect(focus).not.toHaveBeenCalled();
    await first.unmount();
    render(view('p4'));
    await waitFor(() => expect(focus).toHaveBeenCalledTimes(1));
    expect(focus).toHaveBeenCalledWith('demo', 'p4', expect.any(Function));
  });

  it('parses only known surfaces from a deep link', () => {
    expect(parseSurface('terminal')).toBe('terminal');
    expect(parseSurface(['chat'])).toBe('chat');
    expect(parseSurface('other')).toBeUndefined();
  });
});
