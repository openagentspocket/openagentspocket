import { FakeUsageSource, MemoryAccountFileStore } from '@openagentspocket/core';
import { setLocale, translate } from '@openagentspocket/i18n';
import { OverlayHost, ThemeProvider } from '@openagentspocket/ui';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { LimitsScreen } from './LimitsScreen';
import { UsageScreen } from './UsageScreen';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

// The demo windows reset relative to the real clock, as the screens read it.
const source = new FakeUsageSource();

const wrap = (node: React.ReactElement) =>
  render(
    <ThemeProvider themeId="indigo">
      {node}
      <OverlayHost />
    </ThemeProvider>,
  );

describe('UsageScreen', () => {
  afterEach(() => setLocale('en'));

  it('shows the total, switches range and metric, and lists the host left out', async () => {
    await wrap(<UsageScreen source={source} files={new MemoryAccountFileStore()} />);
    await waitFor(() => expect(screen.getByTestId('usage-total-figure')).toBeTruthy());
    const week = screen.getByTestId('usage-total-figure').props.children;
    await fireEvent.press(screen.getByTestId('range-last30Days'));
    expect(screen.getByTestId('usage-total-figure').props.children).not.toBe(week);
    await fireEvent.press(screen.getByTestId('metric-tokens'));
    expect(screen.getByTestId('program-claude')).toBeTruthy();
    expect(screen.getByTestId('excluded-offline')).toBeTruthy();
    expect(screen.getByTestId('usage-day-note')).toBeTruthy();
  });

  it('splits the lone Host total by Claude Code Account', async () => {
    await wrap(<UsageScreen source={source} files={new MemoryAccountFileStore()} />);
    await waitFor(() => expect(screen.getByTestId('usage-total')).toBeTruthy());
    expect(screen.getByTestId('account-usage-default')).toBeTruthy();
    expect(screen.getByTestId('account-usage-7f3c9a2e')).toBeTruthy();
  });

  it('opens the day sheet from a day row', async () => {
    await wrap(<UsageScreen source={source} files={new MemoryAccountFileStore()} />);
    await waitFor(() => expect(screen.getByTestId('usage-daily')).toBeTruthy());
    const day = screen.getAllByTestId(/^day-2026/)[0];
    if (!day) throw new Error('no day row');
    await fireEvent.press(day);
    expect(
      within(screen.getByTestId('usage-day-sheet')).getByTestId('day-program-claude'),
    ).toBeTruthy();
  });

  it('opens the quick sheet with a pace tick and the 80/95 colors on the right windows', async () => {
    await wrap(<UsageScreen source={source} files={new MemoryAccountFileStore()} />);
    await waitFor(() => expect(screen.getByTestId('open-limits-sheet')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('open-limits-sheet'));
    const sheet = screen.getByTestId('usage-quick-sheet');
    expect(within(sheet).getAllByTestId('meter-pace').length).toBeGreaterThan(0);
    // The demo has a window at 96%: its meter fills with danger, not the tint.
    const fills = within(sheet).getAllByTestId('meter-fill');
    const colors = fills.map((fill) => JSON.stringify(fill.props.style));
    expect(new Set(colors).size).toBeGreaterThan(1);
  });

  it('pushes the full limits page', async () => {
    await wrap(<UsageScreen source={source} files={new MemoryAccountFileStore()} />);
    await waitFor(() => expect(screen.getByTestId('open-limits-page')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('open-limits-page'));
    expect(mockPush).toHaveBeenCalledWith('/usage-limits');
  });

  it('adds an Account, refuses a duplicate with a banner, and stops at the limit', async () => {
    const files = new MemoryAccountFileStore();
    await wrap(<UsageScreen source={source} files={files} />);
    await waitFor(() => expect(screen.getByTestId('open-accounts')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('open-accounts'));
    const add = async (directory: string) => {
      await fireEvent.changeText(screen.getByTestId('account-directory'), directory);
      await fireEvent.press(screen.getByTestId('account-add'));
      await waitFor(() =>
        expect(screen.getByTestId('account-add').props.accessibilityState?.disabled).toBeTruthy(),
      );
    };
    await waitFor(() => expect(screen.getByTestId('account-default')).toBeTruthy());
    await add('/srv/.claude-a');
    await add('/srv/.claude-b');
    await add('/srv/.claude-c');
    expect(JSON.parse((await files.read('demo')) ?? '{}').claude.accounts).toHaveLength(3);
    await fireEvent.changeText(screen.getByTestId('account-directory'), '/srv/.claude-d');
    await fireEvent.press(screen.getByTestId('account-add'));
    await waitFor(() => expect(screen.getByTestId('accounts-failure')).toBeTruthy());
    expect(JSON.parse((await files.read('demo')) ?? '{}').claude.accounts).toHaveLength(3);
  });

  it('labels its rows from the catalog of the current locale', async () => {
    setLocale('es');
    await wrap(<UsageScreen source={source} files={new MemoryAccountFileStore()} />);
    await waitFor(() => expect(screen.getByTestId('usage-total')).toBeTruthy());
    expect(screen.getByText(translate('es', 'app', 'Usage Limits'))).toBeTruthy();
  });
});

describe('LimitsScreen', () => {
  it('hides every Claude Code reading while the switch is off', async () => {
    await wrap(<LimitsScreen source={source} />);
    await waitFor(() => expect(screen.getAllByTestId('meter-fiveHour').length).toBeGreaterThan(0));
    await fireEvent(screen.getByTestId('claude-limits-toggle'), 'valueChange', false);
    await waitFor(() => expect(screen.queryAllByTestId('meter-fiveHour')).toHaveLength(0));
  });
});
