import { FakeUsageSource, MemoryAccountFileStore } from '@openagentspocket/core';
import { setLocale, translate } from '@openagentspocket/i18n';
import { OverlayHost, ThemeProvider } from '@openagentspocket/ui';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { atlasUsageSource } from '@/dev/atlas/atlasUsage';
import { LimitsScreen } from './LimitsScreen';
import { UsageScreen } from './UsageScreen';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
}));

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
  beforeEach(() => mockPush.mockClear());
  afterEach(() => setLocale('en'));

  it('shows the total, switches range and metric, and lists the host left out', async () => {
    await wrap(<UsageScreen source={source} files={new MemoryAccountFileStore()} />);
    await waitFor(() => expect(screen.getByTestId('usage-total')).toBeTruthy());
    const week = screen.getByTestId('usage-total').props.children;
    await fireEvent.press(screen.getByTestId('usage-range-last7Days'));
    expect(screen.getByTestId('usage-total').props.children).not.toBe(week);
    await fireEvent.press(screen.getByTestId('usage-metric-tokens'));
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
    await fireEvent.press(screen.getByTestId('usage-breakdown-kind-days'));
    const day = screen.getAllByTestId(/^day-2026/)[0];
    if (!day) throw new Error('no day row');
    await fireEvent.press(day);
    expect(
      within(screen.getByTestId('usage-day-sheet')).getByTestId('day-program-claude'),
    ).toBeTruthy();
  });

  it('right-aligns each figure with its share beneath it and pushes Show All', async () => {
    await wrap(
      <UsageScreen source={atlasUsageSource} files={new MemoryAccountFileStore()} wide={false} />,
    );
    await waitFor(() => expect(screen.getByTestId('usage-breakdown-kind')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('usage-breakdown-kind-days'));
    const amount = screen.getAllByTestId(/^day-amount-/)[0];
    if (!amount) throw new Error('no amount column');
    expect(JSON.stringify(amount.props.style)).toContain('flex-end');
    // The share sits in the same column, under the figure.
    expect(within(amount).getAllByText(/%/).length).toBe(1);
    await fireEvent.press(screen.getByTestId('usage-breakdown-show-all'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/usage-breakdown',
      params: { kind: 'days', metric: 'cost' },
    });
  });

  it('shows the Hosts section only with two Hosts, and the Host column when wide', async () => {
    await wrap(
      <UsageScreen source={atlasUsageSource} files={new MemoryAccountFileStore()} wide={false} />,
    );
    await waitFor(() => expect(screen.getByTestId('host-lab')).toBeTruthy());
    expect(screen.getByTestId('host-demo')).toBeTruthy();
    await screen.unmount();
    await wrap(<UsageScreen source={atlasUsageSource} files={new MemoryAccountFileStore()} wide />);
    await waitFor(() => expect(screen.getByTestId('usage-hosts-column')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('usage-host-lab'));
    expect(screen.getByTestId('usage-wide')).toBeTruthy();
    expect(screen.queryByTestId('usage-host-demo')).toBeTruthy();
  });

  it('offers the Accounts notice for a lone Host and opens the sheet from it', async () => {
    await wrap(<UsageScreen source={source} files={new MemoryAccountFileStore()} />);
    await waitFor(() => expect(screen.getByTestId('usage-total')).toBeTruthy());
    // Two Hosts in scope (one not connected): no notice.
    expect(screen.queryByTestId('usage-accounts-notice')).toBeNull();
    await screen.unmount();
    await wrap(
      <UsageScreen
        source={source}
        files={new MemoryAccountFileStore()}
        initial={{ host: 'demo' }}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('usage-accounts-notice')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('usage-accounts-notice-open'));
    await waitFor(() => expect(screen.getByTestId('usage-accounts-sheet')).toBeTruthy());
  });

  it('puts the Models and Directories links under the day sheet and pushes them', async () => {
    await wrap(
      <UsageScreen
        source={source}
        files={new MemoryAccountFileStore()}
        initial={{ day: 'latest' }}
      />,
    );
    const sheet = await screen.findByTestId('usage-day-sheet');
    expect(within(sheet).getByTestId('usage-day-link-models')).toBeTruthy();
    await fireEvent.press(within(sheet).getByTestId('usage-day-link-directories'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/usage-breakdown',
      params: { kind: 'directories', metric: 'cost' },
    });
  });

  it('carries the Claude Code limits switch on the quick sheet while the limits are off', async () => {
    await wrap(
      <UsageScreen
        source={source}
        files={new MemoryAccountFileStore()}
        initial={{ quick: true, limitsOff: true }}
      />,
    );
    const sheet = await screen.findByTestId('usage-quick-sheet');
    const toggle = within(sheet).getByTestId('claude-limits-toggle-demo');
    expect(within(sheet).queryAllByTestId(/^provider-card-demo\/claude-.*segment-/)).toHaveLength(
      0,
    );
    await fireEvent(toggle, 'valueChange', true);
    await waitFor(() =>
      expect(within(sheet).queryByTestId('claude-limits-toggle-demo')).toBeNull(),
    );
  });

  it('opens the quick sheet with one card per provider and a segmented bar per window', async () => {
    await wrap(<UsageScreen source={source} files={new MemoryAccountFileStore()} />);
    await waitFor(() => expect(screen.getByTestId('open-limits-sheet')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('open-limits-sheet'));
    const sheet = screen.getByTestId('usage-quick-sheet');
    expect(within(sheet).getAllByTestId(/^provider-card-demo\//).length).toBeGreaterThan(1);
    expect(within(sheet).getAllByTestId(/-segment-0$/).length).toBeGreaterThan(1);
    expect(within(sheet).getByTestId('provider-usage-footer')).toBeTruthy();
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
    const [toggle] = screen.getAllByTestId(/^claude-limits-toggle-/);
    if (!toggle) throw new Error('no switch');
    await fireEvent(toggle, 'valueChange', false);
    await waitFor(() => expect(screen.queryAllByTestId('meter-fiveHour')).toHaveLength(0));
  });
});
