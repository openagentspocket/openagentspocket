import { ThemeProvider } from '@openagentspocket/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createDemoConsoleStore } from '../console/demo';
import { ConsoleStoreProvider } from '../console/hooks';
import { BoardScreen } from './BoardScreen';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));

const renderBoard = () => {
  const store = createDemoConsoleStore();
  render(
    <ThemeProvider themeId="indigo">
      <ConsoleStoreProvider store={store}>
        <BoardScreen />
      </ConsoleStoreProvider>
    </ThemeProvider>,
  );
  return store;
};

describe('BoardScreen', () => {
  it('lists every Agent, pins some and reorders the pins', async () => {
    const store = renderBoard();
    await waitFor(() => expect(screen.getByTestId('board-card-p1')).toBeTruthy());
    expect(screen.getByTestId('board-card-p4')).toBeTruthy();
    expect(screen.queryByTestId('board-rank-p1')).toBeNull();

    fireEvent.press(screen.getByTestId('board-pin-p3'));
    fireEvent.press(screen.getByTestId('board-pin-p2'));
    await waitFor(() => expect(screen.getByTestId('board-rank-p2')).toBeTruthy());
    expect(store.getState().rows[0]?.agent.pane_id).toBe('p2');

    fireEvent.press(screen.getByTestId('board-up-p3'));
    await waitFor(() => expect(store.getState().rows[0]?.agent.pane_id).toBe('p3'));
    store.removeHost('demo');
  });
});
