import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { renderThemed } from '../test-utils';
import { terminalColors, terminalThemeById } from '../theme/terminalPalettes';
import { TerminalThemeProvider, useTerminalColors } from './TerminalThemeContext';

function Probe() {
  const colors = useTerminalColors();
  return <Text testID="probe">{`${colors.background}|${colors.palette?.length ?? 0}`}</Text>;
}

describe('useTerminalColors', () => {
  it('keeps the app theme tokens without a provider', async () => {
    await renderThemed(<Probe />);
    expect(String(screen.getByTestId('probe').props.children).endsWith('|0')).toBe(true);
  });

  it('resolves the slot of the current appearance through the registry', async () => {
    await renderThemed(
      <TerminalThemeProvider light="flexoki" dark="vesper">
        <Probe />
      </TerminalThemeProvider>,
    );
    const dark = terminalColors(terminalThemeById('vesper'), 'dark');
    expect(screen.getByTestId('probe').props.children).toBe(`${dark.background}|16`);
  });
});
