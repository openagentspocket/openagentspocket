import { fireEvent, screen } from '@testing-library/react-native';
import { renderThemed } from '../test-utils';
import { LimitWindowRow, segmentFill } from './LimitWindowRow';
import { ProviderUsageCard } from './ProviderUsageCard';

describe('segmentFill', () => {
  it('fills whole segments, then one partial, then none', () => {
    const fills = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => segmentFill(0.62, i));
    expect(fills.slice(0, 6)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(fills[6]).toBeCloseTo(0.2);
    expect(fills.slice(7)).toEqual([0, 0, 0]);
  });
  it('clamps out-of-range shares', () => {
    expect(segmentFill(2, 9)).toBe(1);
    expect(segmentFill(-1, 0)).toBe(0);
    expect(segmentFill(Number.NaN, 0)).toBe(0);
  });
});

describe('ProviderUsageCard', () => {
  it('renders a row per window and opens the detail on press', async () => {
    const onPress = jest.fn();
    await renderThemed(
      <ProviderUsageCard
        program="codex"
        brand="openai"
        name="Codex"
        hostName="Studio Mac"
        windows={[
          { label: '5-hour', usedShare: 0.07, percentText: '7%', resetText: '2h' },
          { label: 'Weekly', usedShare: 0.04, percentText: '4%', resetText: '6d' },
        ]}
        onPress={onPress}
      />,
    );
    expect(screen.getByLabelText('5-hour, 7%, 2h')).toBeTruthy();
    expect(screen.getByLabelText('Weekly, 4%, 6d')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('provider-usage-card'));
    expect(onPress).toHaveBeenCalled();
  });

  it('draws an empty bar while the share is unknown', async () => {
    await renderThemed(
      <LimitWindowRow
        label="Weekly"
        usedShare={null}
        color="#fff"
        percentText=""
        resetText=""
        testID="w"
      />,
    );
    expect(screen.getByTestId('w-segment-0').children).toHaveLength(0);
  });

  it('stacks the Meter and pace, or the unknown note without a share', async () => {
    const row = (usedShare: number | null) => (
      <LimitWindowRow
        layout="stacked"
        label="Weekly"
        usedShare={usedShare}
        percentText={usedShare === null ? '' : '40%'}
        resetText="Resets in 2 days"
        unknownText="unknown"
        paceText="On pace"
        meterTestID="m"
        paceTestID="p"
      />
    );
    const view = await renderThemed(row(0.4));
    expect(screen.getByTestId('m')).toBeTruthy();
    expect(screen.getByTestId('p')).toBeTruthy();
    await view.unmount();
    await renderThemed(row(null));
    expect(screen.queryByTestId('m')).toBeNull();
    expect(screen.getByText('unknown')).toBeTruthy();
  });

  it('draws a Meter on one line when inline', async () => {
    await renderThemed(
      <LimitWindowRow
        layout="inline"
        label="5-hour"
        usedShare={0.1}
        percentText="10%"
        resetText="2h"
        meterTestID="m"
      />,
    );
    expect(screen.getByTestId('m')).toBeTruthy();
    expect(screen.getByLabelText('5-hour, 10%')).toBeTruthy();
  });
});
