import { ThemeProvider } from '@openagentspocket/ui';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { type CrashStorage, memoryCrashStorage } from './crashRecorder';
import { ReportProblemScreen } from './ReportProblemScreen';

jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));

const BUILD = { version: '1.0.0', build: '42', system: 'ios 26.1' };
const CRASH = { at: 0, message: 'rows is undefined', stack: '', fatal: true };

async function renderScreen(storage: CrashStorage) {
  const open = jest.fn();
  await render(
    <ThemeProvider themeId="indigo">
      <ReportProblemScreen storage={storage} build={BUILD} open={open} />
    </ThemeProvider>,
  );
  const sent = () => decodeURIComponent(String(open.mock.calls.at(-1)?.[0]));
  return { open, sent };
}

describe('settings.report-problem', () => {
  it('shows the recorded crash it will send and sends it', async () => {
    const { sent } = await renderScreen(memoryCrashStorage(CRASH));
    expect(screen.getByTestId('report-preview')).toHaveTextContent(/rows is undefined/);
    await fireEvent.press(screen.getByTestId('report-open'));
    expect(sent()).toContain(CRASH.message);
    expect(sent()).toContain('42');
  });

  it('leaves the crash out of the preview and the link once turned off', async () => {
    const { sent } = await renderScreen(memoryCrashStorage(CRASH));
    await fireEvent(screen.getByTestId('report-include-crash'), 'valueChange', false);
    expect(screen.getByTestId('report-preview')).not.toHaveTextContent(/rows is undefined/);
    await fireEvent.press(screen.getByTestId('report-open'));
    expect(sent()).not.toContain(CRASH.message);
  });

  it('offers no crash switch when none was recorded', async () => {
    await renderScreen(memoryCrashStorage());
    expect(screen.queryByTestId('report-include-crash')).toBeNull();
    expect(screen.getByTestId('report-open')).toBeTruthy();
  });
});
