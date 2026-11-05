import { ThemeProvider } from '@openagentspocket/ui';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { type CrashStorage, readLastCrash } from './crashRecorder';
import { LastCrashBanner } from './LastCrashBanner';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));

function storageWith(raw: string): CrashStorage & { raw: string } {
  const state = { raw };
  return {
    get raw() {
      return state.raw;
    },
    getItemSync: () => state.raw,
    setItemSync: (_key, value) => {
      state.raw = value;
    },
  };
}

const renderBanner = (storage: CrashStorage) =>
  render(
    <ThemeProvider themeId="indigo">
      <LastCrashBanner storage={storage} />
    </ThemeProvider>,
  );

describe('LastCrashBanner', () => {
  it('shows the recorded error and forgets it once dismissed', async () => {
    const storage = storageWith(
      JSON.stringify({ at: 1, message: 'rows is undefined', stack: '', fatal: true }),
    );
    await renderBanner(storage);
    expect(screen.getByText('rows is undefined')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Dismiss'));
    expect(screen.queryByTestId('last-crash-banner')).toBeNull();
    expect(readLastCrash(storage)).toBeUndefined();
  });

  it('renders nothing when no error was recorded', async () => {
    await renderBanner(storageWith(''));
    expect(screen.queryByTestId('last-crash-banner')).toBeNull();
  });
});
