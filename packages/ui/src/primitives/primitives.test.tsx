import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import {
  Badge,
  Button,
  Card,
  SectionHeader,
  StatusDot,
  Text,
  ThemeProvider,
  themes,
} from '../index';

const renderThemed = (ui: ReactElement, themeId: 'indigo' | 'papel' | 'noche' = 'indigo') =>
  render(<ThemeProvider themeId={themeId}>{ui}</ThemeProvider>);

describe('Button', () => {
  it('fires onPress', async () => {
    const onPress = jest.fn();
    await renderThemed(<Button title="Go" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Go' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled', async () => {
    const onPress = jest.fn();
    await renderThemed(<Button title="Go" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByRole('button', { name: 'Go' }));
    expect(onPress).not.toHaveBeenCalled();
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
});

describe('StatusDot', () => {
  it('takes its color from the theme token of the status', async () => {
    await renderThemed(<StatusDot status="blocked" />);
    expect(screen.getByTestId('status-dot-blocked', { includeHiddenElements: true })).toHaveStyle({
      backgroundColor: themes.indigo.colors.statusBlocked,
    });
  });

  it('changes color with the theme', async () => {
    await renderThemed(<StatusDot status="done" />, 'papel');
    expect(screen.getByTestId('status-dot-done', { includeHiddenElements: true })).toHaveStyle({
      backgroundColor: themes.papel.colors.statusDone,
    });
  });
});

describe('SectionHeader', () => {
  it('shows the count in a badge and exposes a header role', async () => {
    await renderThemed(<SectionHeader title="Needs you" status="blocked" count={3} />);
    expect(screen.getByRole('header')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });
});

describe('Badge', () => {
  it('renders its label', async () => {
    await renderThemed(<Badge label="new" />);
    expect(screen.getByText('new')).toBeTruthy();
  });
});

describe('useTheme', () => {
  it('throws outside a provider', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(render(<Text>x</Text>)).rejects.toThrow('ThemeProvider');
    spy.mockRestore();
  });
});
