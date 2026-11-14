import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useOverlayShowing } from '../overlay/presence';
import { renderThemed } from '../test-utils';
import { ThemeProvider } from '../theme/theme';
import { PermissionPrimer } from './PermissionPrimer';

const reasons = [
  { icon: 'hand', title: 'Reason one', message: 'First sentence.' },
  { icon: 'bell', title: 'Reason two', message: 'Second sentence.' },
] as const;

function Probe() {
  return <Text testID="probe">{String(useOverlayShowing())}</Text>;
}

describe('PermissionPrimer', () => {
  it('shows the title, every reason, both actions and the fine print', async () => {
    const primary = jest.fn();
    const secondary = jest.fn();
    await renderThemed(
      <PermissionPrimer
        visible
        onClose={jest.fn()}
        title="Primer title"
        reasons={reasons}
        primary={{ label: 'Yes', onPress: primary }}
        secondary={{ label: 'Later', onPress: secondary }}
        finePrint="Change it later."
      />,
    );
    expect(screen.getByText('Primer title')).toBeTruthy();
    for (const reason of reasons) {
      expect(screen.getByText(reason.title)).toBeTruthy();
      expect(screen.getByText(reason.message)).toBeTruthy();
    }
    expect(screen.getByText('Change it later.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('permission-primer-primary'));
    await fireEvent.press(screen.getByTestId('permission-primer-secondary'));
    expect(primary).toHaveBeenCalledTimes(1);
    expect(secondary).toHaveBeenCalledTimes(1);
  });

  it('counts as an overlay on screen while visible', async () => {
    const primer = (visible: boolean) => (
      <ThemeProvider themeId="indigo">
        <Probe />
        <PermissionPrimer
          visible={visible}
          onClose={jest.fn()}
          title="Primer title"
          reasons={reasons}
          primary={{ label: 'Yes', onPress: jest.fn() }}
          secondary={{ label: 'Later', onPress: jest.fn() }}
        />
      </ThemeProvider>
    );
    const view = await renderThemed(primer(false));
    expect(screen.getByTestId('probe').props.children).toBe('false');
    await view.rerender(primer(true));
    expect(screen.getByTestId('probe').props.children).toBe('true');
  });
});
