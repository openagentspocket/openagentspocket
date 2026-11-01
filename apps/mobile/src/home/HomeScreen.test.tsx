import { ThemeProvider } from '@agentico/ui';
import { render, screen, waitFor } from '@testing-library/react-native';
import { HomeScreen } from './HomeScreen';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));

describe('HomeScreen', () => {
  it('lists the three sections with the demo Agents in the right one', async () => {
    await render(
      <ThemeProvider themeId="indigo">
        <HomeScreen />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('agent-p1')).toBeTruthy());
    expect(screen.getAllByRole('header')).toHaveLength(3);
    expect(screen.getByTestId('agent-p4')).toBeTruthy();
  });
});
