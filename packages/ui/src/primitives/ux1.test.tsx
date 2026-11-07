import { fireEvent, screen } from '@testing-library/react-native';
import { groupMenuItems } from '../overlay/menuGroups';
import { Sheet } from '../overlay/Sheet';
import { detentShare, settleDetent } from '../overlay/sheetDetents';
import { renderThemed, setFontScale } from '../test-utils';
import { themes } from '../theme/tokens.generated';
import { Badge } from './Badge';
import { MetaChip } from './MetaChip';
import { ScreenBackground } from './ScreenBackground';
import { Segmented } from './Segmented';
import { StatusOrb } from './StatusOrb';
import { passedFullSwipe, type SwipeEdges, settleSwipe } from './swipeMath';
import { Text } from './Text';

const edges: SwipeEdges = {
  leading: 76,
  trailing: 76,
  leadingFull: true,
  trailingFull: true,
  rowWidth: 400,
};

describe('swipe math', () => {
  it('opens past the threshold, closes below it', () => {
    expect(settleSwipe(-60, 'closed', edges)).toBe('trailing');
    expect(settleSwipe(60, 'closed', edges)).toBe('leading');
    expect(settleSwipe(-10, 'closed', edges)).toBe('closed');
    expect(settleSwipe(-10, 'trailing', edges)).toBe('closed');
  });
  it('commits a full swipe only on an edge that allows it', () => {
    expect(passedFullSwipe(-250, edges)).toBe('trailing');
    expect(settleSwipe(250, 'closed', edges)).toBe('commit-leading');
    expect(settleSwipe(-250, 'closed', { ...edges, trailingFull: false })).toBe('trailing');
  });
});

describe('sheet detents', () => {
  it('keeps a fraction between 20% and large and returns to it from large', () => {
    expect(detentShare({ fraction: 0.65 })).toBe(0.65);
    expect(detentShare({ fraction: 1 })).toBeLessThan(1);
    expect(settleDetent('large', 80, 0, { fraction: 0.65 })).toEqual({ fraction: 0.65 });
    expect(settleDetent({ fraction: 0.65 }, -80, 0)).toBe('large');
  });
});

describe('menu groups', () => {
  const noop = () => {};
  it('starts a group at a titled section and before a destructive item', () => {
    const groups = groupMenuItems([
      { key: 'a', title: 'A', section: 'Host', onPress: noop },
      { key: 'b', title: 'B', onPress: noop },
      { key: 'c', title: 'C', destructive: true, onPress: noop },
    ]);
    expect(groups.map((g) => g.items.map((i) => i.key))).toEqual([['a', 'b'], ['c']]);
    expect(groups[0]?.title).toBe('Host');
  });
});

describe('UX1 primitives', () => {
  it('Text scales the iOS styles', async () => {
    await renderThemed(
      <>
        <Text variant="body">b</Text>
        <Text variant="footnote">f</Text>
        <Text variant="caption2" monospaced>
          c
        </Text>
      </>,
    );
    expect(screen.getByText('b')).toHaveStyle({ fontSize: 17 });
    expect(screen.getByText('f')).toHaveStyle({ fontSize: 13 });
    expect(screen.getByText('c')).toHaveStyle({ fontSize: 11 });
  });

  it('paints the glow from the theme', async () => {
    await renderThemed(<ScreenBackground />, 'papel');
    expect(screen.getByTestId('screen-background', { includeHiddenElements: true })).toHaveStyle({
      backgroundColor: themes.papel.colors.canvas,
    });
  });

  it('Badge wash fills with the color at the wash opacity', async () => {
    await renderThemed(<Badge kind="wash" color="#FFAA00" label="16 %" testID="b" />);
    expect(screen.getByTestId('b')).toHaveStyle({ backgroundColor: '#FFAA0026' });
  });

  it('MetaChip is one accessible label', async () => {
    await renderThemed(<MetaChip label="api" testID="m" />);
    expect(screen.getByLabelText('api')).toBeTruthy();
  });

  it('StatusOrb is hidden from screen readers', async () => {
    await renderThemed(<StatusOrb />);
    expect(screen.getByTestId('status-orb', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('status-orb')).toBeNull();
  });

  it('Segmented selects one option as a radio', async () => {
    const onChange = jest.fn();
    await renderThemed(
      <Segmented
        value="week"
        onChange={onChange}
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
        ]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Week' })).toBeSelected();
    await fireEvent.press(screen.getByRole('radio', { name: 'Day' }));
    expect(onChange).toHaveBeenCalledWith('day');
  });

  it('Sheet bar actions replace the close button and run', async () => {
    const save = jest.fn();
    const cancel = jest.fn();
    await renderThemed(
      <Sheet
        visible
        title="New"
        onClose={() => {}}
        leading={{ label: 'Cancel', onPress: cancel }}
        trailing={{ label: 'Save', onPress: save }}
        detent={{ fraction: 0.6 }}
      >
        <Text>body</Text>
      </Sheet>,
    );
    expect(screen.queryByTestId('sheet-close')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(save).toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
  });

  it('Text follows a forced accessibility scale', async () => {
    setFontScale(1);
    await renderThemed(<Text>plain</Text>);
    expect(screen.getByText('plain')).toHaveStyle({ fontSize: 17 });
  });
});
