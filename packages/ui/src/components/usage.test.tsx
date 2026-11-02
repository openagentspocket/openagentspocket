import { fireEvent, screen } from '@testing-library/react-native';
import { renderThemed } from '../test-utils';
import { UsageBreakdownRow } from './UsageBreakdownRow';
import { UsageChart } from './UsageChart';
import { UsageHeatMap } from './UsageHeatMap';
import { UsageLimitChip } from './UsageLimitChip';
import { UsageTotals } from './UsageTotals';
import { chartMax, niceCeiling, scrubIndex, smoothPath } from './usageChartMath';
import { heatLevel, heatRows } from './usageHeatMath';

describe('usage math', () => {
  it('picks round axis ceilings and clamps scrub indexes', async () => {
    expect(niceCeiling(2.5)).toBe(4);
    expect(niceCeiling(0)).toBe(1);
    expect(chartMax([{ points: [1, 3] }, { points: [2] }])).toBe(3);
    expect(scrubIndex(-5, 100, 30)).toBe(0);
    expect(scrubIndex(500, 100, 30)).toBe(29);
    expect(
      smoothPath([
        { x: 0, y: 0 },
        { x: 10, y: 5 },
      ]).startsWith('M0,0C'),
    ).toBe(true);
  });
  it('maps values to five steps and pads weeks', async () => {
    expect(heatLevel(0, 5)).toBe(0);
    expect(heatLevel(5, 5)).toBe(4);
    expect(heatLevel(0.1, 5)).toBe(1);
    const rows = heatRows([1, 2, 3], 2);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.filter((cell) => cell === null)).toHaveLength(4);
  });
});

describe('UsageLimitChip', () => {
  it('is one button naming Host, program, window and percent', async () => {
    const onPress = jest.fn();
    await renderThemed(
      <UsageLimitChip
        percent={48}
        host="Build"
        program="Codex"
        window="Weekly"
        onPress={onPress}
      />,
    );
    const chip = screen.getByRole('button');
    expect(chip.props.accessibilityLabel).toContain('48');
    await fireEvent.press(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('UsageTotals', () => {
  const options = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
  ];
  it('changes metric through the segments', async () => {
    const onChange = jest.fn();
    await renderThemed(
      <UsageTotals metric={{ options, value: 'a', onChange }} total="US$ 1" tokens="1K" />,
    );
    await fireEvent.press(screen.getByTestId('usage-metric-b'));
    expect(onChange).toHaveBeenCalledWith('b');
  });
  it('day mode steps and closes; next is disabled on the latest day', async () => {
    const onPrevious = jest.fn();
    const onClose = jest.fn();
    await renderThemed(
      <UsageTotals
        mode="day"
        title="Sun"
        total="US$ 1"
        tokens="1K"
        day={{ previousLabel: 'p', nextLabel: 'n', closeLabel: 'c', onPrevious, onClose }}
      />,
    );
    await fireEvent.press(screen.getByTestId('usage-day-previous'));
    await fireEvent.press(screen.getByTestId('usage-day-close'));
    expect(onPrevious).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByTestId('usage-day-next').props.accessibilityState.disabled).toBe(true);
  });
});

describe('UsageChart', () => {
  it('exposes a label and one legend entry per series', async () => {
    await renderThemed(
      <UsageChart
        series={[
          { key: 'a', label: 'Claude Code', color: '#FF0000', points: [1, 2] },
          { key: 'b', label: 'Codex', color: '#00FF00', points: [0, 1] },
        ]}
        dayLabels={['1', '2']}
        formatValue={String}
        hint="Hold"
        accessibilityLabel="Cost"
      />,
    );
    expect(screen.getByLabelText('Cost')).toBeTruthy();
    expect(screen.getByText('Claude Code')).toBeTruthy();
    expect(screen.getByText('Codex')).toBeTruthy();
  });
});

describe('UsageHeatMap', () => {
  const days = [
    { date: 'd1', label: '1', accessibilityLabel: 'one', value: 0, recorded: false },
    { date: 'd2', label: '2', accessibilityLabel: 'two', value: 4, recorded: true },
  ];
  it('selects recorded days only and shows the legend when asked', async () => {
    const onSelect = jest.fn();
    await renderThemed(
      <UsageHeatMap
        days={days}
        weekdays={['M', 'T', 'W', 'T', 'F', 'S', 'S']}
        today="d2"
        onSelect={onSelect}
        legend={{ less: 'L', more: 'M', today: 'T', notRecorded: 'N' }}
      />,
    );
    await fireEvent.press(screen.getByTestId('heat-d1'));
    await fireEvent.press(screen.getByTestId('heat-d2'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('d2');
    expect(screen.getByTestId('heat-d2-level-4')).toBeTruthy();
    expect(screen.getByTestId('usage-heat-legend')).toBeTruthy();
  });
});

describe('UsageBreakdownRow', () => {
  it('draws one split segment per non-empty part and a legend', async () => {
    await renderThemed(
      <UsageBreakdownRow
        title="Codex"
        cost="US$ 1"
        tokens="1K"
        split={{ input: 1, cacheRead: 5, cacheWrite: 0, output: 1 }}
        splitLabels={['a', 'b', 'c', 'd']}
      />,
    );
    expect(screen.getByTestId('usage-split-1')).toBeTruthy();
    expect(screen.queryByTestId('usage-split-2')).toBeNull();
    expect(screen.getByTestId('usage-split-legend')).toBeTruthy();
  });
  it('host variant reads as one labelled card', async () => {
    await renderThemed(
      <UsageBreakdownRow variant="host" title="Mac" subtitle="1 Nov" cost="US$ 1" tokens="1K" />,
    );
    expect(screen.getByLabelText(/Mac/)).toBeTruthy();
  });
});
