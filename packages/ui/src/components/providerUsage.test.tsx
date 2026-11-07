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

describe('LimitWindowRow meter variants', () => {
  const window = {
    label: 'Weekly',
    usedShare: 0.62,
    paceShare: 0.4,
    percentText: '62%',
    resetText: '2d',
    paceText: 'Ahead',
    unknownText: 'Unknown',
    meterTestID: 'bar',
    paceTestID: 'pace',
  };

  it('stacks the bar with its pace tick and the pace line', async () => {
    await renderThemed(<LimitWindowRow variant="meter" {...window} />);
    expect(screen.getByLabelText('Weekly, 62%')).toBeTruthy();
    expect(screen.getByTestId('meter-pace', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('pace', { includeHiddenElements: true })).toBeTruthy();
  });

  it('says so instead of a bar while the share is unknown', async () => {
    await renderThemed(
      <LimitWindowRow variant="meter" {...window} usedShare={null} percentText="" testID="w" />,
    );
    expect(screen.getByLabelText('Weekly')).toBeTruthy();
    expect(screen.queryByTestId('bar', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByText('Unknown', { includeHiddenElements: true })).toBeTruthy();
  });

  it('keeps one line, without the pace line or the unknown text', async () => {
    await renderThemed(
      <LimitWindowRow variant="meterInline" {...window} usedShare={null} percentText="" />,
    );
    expect(screen.queryByTestId('bar', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByTestId('pace', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByText('Unknown', { includeHiddenElements: true })).toBeNull();
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
});
