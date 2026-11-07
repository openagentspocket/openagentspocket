import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import {
  Badge,
  Button,
  Card,
  Chip,
  COPY_CONFIRMATION_MS,
  CopyableValueRow,
  CopyButton,
  Icon,
  Screen,
  SectionHeader,
  StatusDot,
  StatusPill,
  Text,
  themes,
  withAlpha,
} from '../index';
import { renderThemed } from '../test-utils';
import { keyboardOffset } from './screenParts';

const mockSetString = jest.fn(async (_value: string) => true);
jest.mock('expo-clipboard', () => ({ setStringAsync: (value: string) => mockSetString(value) }));

describe('Button', () => {
  it('fires onPress', async () => {
    const onPress = jest.fn();
    await renderThemed(<Button title="Go" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Go' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled or loading', async () => {
    const onPress = jest.fn();
    await renderThemed(
      <>
        <Button title="Off" onPress={onPress} disabled />
        <Button title="Busy" onPress={onPress} loading />
      </>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Off' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Busy' }));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Busy' })).toBeBusy();
  });

  it('names an icon-only button by its accessibility label', async () => {
    await renderThemed(<Button icon="more" accessibilityLabel="More" onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'More' })).toBeTruthy();
  });

  it('inks a destructive button in the danger color on its wash', async () => {
    await renderThemed(<Button kind="destructive" title="Delete" onPress={() => {}} testID="b" />);
    expect(screen.getByTestId('b')).toHaveStyle({
      backgroundColor: withAlpha(themes.indigo.colors.danger, 0.15),
    });
    expect(screen.getByText('Delete')).toHaveStyle({ color: themes.indigo.colors.danger });
  });
});

describe('Card', () => {
  it('is a button only when pressable', async () => {
    const onPress = jest.fn();
    await renderThemed(
      <>
        <Card testID="static">
          <Text>static</Text>
        </Card>
        <Card testID="tappable" onPress={onPress} accessibilityLabel="Open">
          <Text>tappable</Text>
        </Card>
      </>,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Open' }));
    expect(onPress).toHaveBeenCalled();
  });

  it('draws the overlay level and an accent outline from tokens', async () => {
    await renderThemed(
      <Card testID="card" level="overlay" accent="statusBlocked">
        <Text>x</Text>
      </Card>,
      'papel',
    );
    expect(screen.getByTestId('card')).toHaveStyle({
      backgroundColor: themes.papel.colors.surfaceOverlay,
      borderColor: withAlpha(themes.papel.colors.statusBlocked, 0.4),
      borderRadius: 8,
    });
  });

  it('fills the control level, a tint wash, and marks the selected option', async () => {
    const { colors } = themes.papel;
    await renderThemed(
      <>
        <Card testID="control" level="control">
          <Text>x</Text>
        </Card>
        <Card testID="tint" tint="danger">
          <Text>x</Text>
        </Card>
        <Card testID="choice" selected onPress={() => {}} accessibilityLabel="Papel">
          <Text>x</Text>
        </Card>
      </>,
      'papel',
    );
    expect(screen.getByTestId('control')).toHaveStyle({ backgroundColor: colors.control });
    expect(screen.getByTestId('tint')).not.toHaveStyle({ backgroundColor: colors.surface });
    expect(screen.getByRole('button', { name: 'Papel' })).toBeSelected();
  });
});

describe('StatusDot and StatusPill', () => {
  it('takes the dot color from the status token of the theme', async () => {
    await renderThemed(<StatusDot status="blocked" />);
    expect(screen.getByTestId('status-dot-blocked', { includeHiddenElements: true })).toHaveStyle({
      backgroundColor: themes.indigo.colors.statusBlocked,
    });
  });

  it.each(['indigo', 'papel', 'noche'] as const)(
    'inks a pill in its status color (%s)',
    async (id) => {
      await renderThemed(<StatusPill status="done" label="Done" />, id);
      expect(screen.getByTestId('status-pill-done')).toHaveStyle({
        backgroundColor: withAlpha(themes[id].colors.statusDone, 0.15),
      });
      expect(screen.getByText('Done')).toHaveStyle({ color: themes[id].colors.statusDone });
      expect(screen.getByLabelText('Done')).toBeTruthy();
    },
  );
});

describe('SectionHeader', () => {
  it('shows the count and exposes a header role', async () => {
    await renderThemed(<SectionHeader title="Needs you" status="blocked" count={3} />);
    expect(screen.getByRole('header')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('runs its trailing action and toggles when collapsible', async () => {
    const onPress = jest.fn();
    const onToggle = jest.fn();
    await renderThemed(
      <SectionHeader
        title="Done"
        expanded={false}
        onToggle={onToggle}
        action={{ title: 'See all', onPress, accessibilityLabel: 'See all Done' }}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'See all Done' }));
    expect(onPress).toHaveBeenCalled();
    expect(screen.getByRole('header')).toBeCollapsed();
    await fireEvent.press(screen.getByRole('header'));
    expect(onToggle).toHaveBeenCalled();
  });
});

describe('Badge and Chip', () => {
  it('renders a badge label in each kind', async () => {
    await renderThemed(
      <>
        <Badge label="new" />
        <Badge label="4" kind="control" testID="control" />
      </>,
    );
    expect(screen.getByText('new')).toBeTruthy();
    expect(screen.getByTestId('control')).toHaveStyle({
      backgroundColor: themes.indigo.colors.control,
    });
  });

  it('makes a filter chip a selectable button', async () => {
    const onPress = jest.fn();
    await renderThemed(<Chip label="Blocked" selected onPress={onPress} />);
    const chip = screen.getByRole('button', { name: 'Blocked' });
    expect(chip).toBeSelected();
    await fireEvent.press(chip);
    expect(onPress).toHaveBeenCalled();
  });
});

describe('Icon', () => {
  it('is hidden from screen readers unless labeled', async () => {
    await renderThemed(
      <>
        <Icon name="copy" />
        <Icon name="warning" accessibilityLabel="Warning" />
      </>,
    );
    expect(screen.queryByTestId('icon-copy')).toBeNull();
    expect(screen.getByTestId('icon-copy', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByRole('image', { name: 'Warning' })).toBeTruthy();
  });
});

describe('CopyButton', () => {
  beforeEach(() => mockSetString.mockClear());

  it('copies, announces, shows the copied state, then reverts', async () => {
    jest.useFakeTimers();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await renderThemed(<CopyButton value="wB:p1" title="Copy Command" copiedTitle="Copied" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Copy Command' }));
    expect(mockSetString).toHaveBeenCalledWith('wB:p1');
    expect(announce).toHaveBeenCalledWith('Copied');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(COPY_CONFIRMATION_MS);
    });
    expect(screen.getByRole('button', { name: 'Copy Command' })).toBeTruthy();
    jest.useRealTimers();
  });

  it('labels the row copy button after its label and skips it when not copyable', async () => {
    await renderThemed(
      <>
        <CopyableValueRow label="Pane id" value="wB:p1" />
        <CopyableValueRow label="Name" value="api" copyable={false} />
      </>,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Copy Pane id' }));
    expect(mockSetString).toHaveBeenCalledWith('wB:p1');
  });
});

describe('useTheme', () => {
  it('throws outside a provider', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(render(<Text>x</Text>)).rejects.toThrow('ThemeProvider');
    spy.mockRestore();
  });
});

describe('Screen keyboard avoidance', () => {
  it('adds what the frame misses above it, so the lift reaches the real bottom', () => {
    // An 874 pt window, 34 under the screen; the frame ends at 768, relative to its parent.
    expect(keyboardOffset(874, 34, 768)).toBe(72);
    expect(keyboardOffset(874, 34, 840)).toBe(0);
    expect(keyboardOffset(874, 34, 0)).toBe(0);
  });

  it('wraps the content in a keyboard-avoiding view and still renders it', async () => {
    const view = await renderThemed(
      <Screen keyboardAvoiding testID="form">
        <Text>b</Text>
      </Screen>,
    );
    expect(view.getByTestId('form-keyboard')).toBeTruthy();
    expect(view.getByText('b')).toBeTruthy();
  });
});
