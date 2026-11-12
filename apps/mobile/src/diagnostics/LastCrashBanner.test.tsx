import { translate } from '@openagentspocket/i18n';
import { ThemeProvider } from '@openagentspocket/ui';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { type CrashStorage, memoryCrashStorage, readLastCrash } from './crashRecorder';
import { LastCrashBanner } from './LastCrashBanner';

const renderBanner = (storage: CrashStorage) =>
  render(
    <ThemeProvider themeId="indigo">
      <LastCrashBanner storage={storage} />
    </ThemeProvider>,
  );

describe('LastCrashBanner', () => {
  it('shows the recorded error and forgets it once dismissed', async () => {
    const storage = memoryCrashStorage({
      at: 1,
      message: 'rows is undefined',
      stack: '',
      fatal: true,
    });
    await renderBanner(storage);
    expect(screen.getByText('rows is undefined')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Dismiss'));
    expect(screen.queryByTestId('last-crash-banner')).toBeNull();
    expect(readLastCrash(storage)).toBeUndefined();
  });

  it('tells an error a screen recovered from apart from one the app closed on', async () => {
    const withRecord = (fatal: boolean) =>
      memoryCrashStorage({ at: 1, message: 'rows is undefined', stack: '', fatal });
    const closed = translate('en', 'app', 'The app closed unexpectedly');
    const caught = translate('en', 'app', 'Something went wrong');
    await renderBanner(withRecord(false));
    expect(screen.getByText(caught)).toBeTruthy();
    expect(screen.queryByText(closed)).toBeNull();
    screen.unmount();
    await renderBanner(withRecord(true));
    expect(screen.getByText(closed)).toBeTruthy();
  });

  it('renders nothing when no error was recorded', async () => {
    await renderBanner(memoryCrashStorage());
    expect(screen.queryByTestId('last-crash-banner')).toBeNull();
  });
});
