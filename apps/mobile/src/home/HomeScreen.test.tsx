import { setLocale, translate } from '@agentico/i18n';
import { ThemeProvider } from '@agentico/ui';
import { render, screen, waitFor } from '@testing-library/react-native';
import { HomeScreen } from './HomeScreen';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));

const renderHome = () =>
  render(
    <ThemeProvider themeId="indigo">
      <HomeScreen />
    </ThemeProvider>,
  );

describe('HomeScreen', () => {
  afterEach(() => {
    setLocale('en');
  });

  it('lists the three sections with the demo Agents in the right one', async () => {
    await renderHome();
    await waitFor(() => expect(screen.getByTestId('agent-p1')).toBeTruthy());
    expect(screen.getAllByRole('header')).toHaveLength(3);
    expect(screen.getByTestId('agent-p4')).toBeTruthy();
  });

  it('titles the sections from the catalog of the current locale', async () => {
    setLocale('es');
    await renderHome();
    await waitFor(() => expect(screen.getByTestId('agent-p1')).toBeTruthy());
    for (const key of ['Needs you', 'Working', 'Done']) {
      const spanish = translate('es', 'app', key);
      expect(spanish).not.toBe(translate('en', 'app', key));
      expect(screen.getByText(spanish.toUpperCase())).toBeTruthy();
    }
  });
});
