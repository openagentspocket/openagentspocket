import {
  FakeUsageHostPort,
  FakeUsageSource,
  LiveUsageSource,
  MemoryAccountFileStore,
  MemoryStorage,
} from '@openagentspocket/core';
import { systemClock } from '@openagentspocket/transport';
import { OverlayHost, ThemeProvider } from '@openagentspocket/ui';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { LimitsScreen } from './LimitsScreen';
import { UsageScreen } from './UsageScreen';
import { UsageSourceProvider } from './UsageSourceProvider';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const wrap = (node: React.ReactElement) =>
  render(
    <ThemeProvider themeId="indigo">
      {node}
      <OverlayHost />
    </ThemeProvider>,
  );

function liveSource() {
  const storage = new MemoryStorage();
  const port = new FakeUsageHostPort();
  const source = new LiveUsageSource({ clock: systemClock, storage, timeZone: () => 'UTC' });
  source.setHosts([{ id: 'h1', name: 'Work Host', port }]);
  return { source, port, storage };
}

describe('Usage over a live source', () => {
  it('reads the Host when the screen opens and shows its figures', async () => {
    const { source, port } = liveSource();
    await wrap(
      <UsageSourceProvider source={source} files={source.accountFiles}>
        <LimitsScreen />
      </UsageSourceProvider>,
    );
    await waitFor(() => expect(port.queries).toHaveLength(1));
    expect(port.queries[0]?.claudeLimits).toBe(false);
  });

  it('keeps the Claude Code limits switch on the device and asks the plugin for them', async () => {
    const { source, port, storage } = liveSource();
    await wrap(<LimitsScreen source={source} />);
    await waitFor(() => expect(port.queries).toHaveLength(1));
    const toggle = screen.getByTestId('claude-limits-toggle-h1');
    await fireEvent(toggle, 'valueChange', true);
    await waitFor(() => expect(port.queries.at(-1)?.claudeLimits).toBe(true));
    expect(storage.getString('usage.claude-limits.h1')).toBe('true');
  });

  it('a Host without a connection is listed as left out, not as an error', async () => {
    const source = new LiveUsageSource({
      clock: systemClock,
      storage: new MemoryStorage(),
    });
    source.setHosts([{ id: 'off', name: 'Spare Host', port: null }]);
    await wrap(<UsageScreen source={source} files={new MemoryAccountFileStore()} />);
    await waitFor(() => expect(screen.getByTestId('excluded-off')).toBeTruthy());
  });
});

describe('Calendar days', () => {
  it('open the day sheet like the Days rows do', async () => {
    await wrap(<UsageScreen source={new FakeUsageSource()} files={new MemoryAccountFileStore()} />);
    await waitFor(() => expect(screen.getByTestId('usage-daily')).toBeTruthy());
    const cell = screen
      .getAllByTestId(/^heat-2026-\d\d-\d\d$/)
      .find((c) => c.props.accessibilityState?.disabled !== true);
    if (!cell) throw new Error('no recorded day');
    await fireEvent.press(cell);
    expect(
      within(screen.getByTestId('usage-day-sheet')).getByTestId('day-program-claude'),
    ).toBeTruthy();
  });
});
