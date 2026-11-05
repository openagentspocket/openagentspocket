import { fireEvent, screen } from '@testing-library/react-native';
import { Keyboard } from 'react-native';
import { renderThemed } from '../test-utils';
import { KeyboardDismissButton } from './KeyboardDismissButton';

describe('KeyboardDismissButton', () => {
  it('draws nothing while no keyboard is up, and hides the keyboard when pressed', async () => {
    await renderThemed(<KeyboardDismissButton />);
    expect(screen.queryByTestId('keyboard-dismiss')).toBeNull();
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    await renderThemed(<KeyboardDismissButton alwaysVisible />);
    await fireEvent.press(screen.getByTestId('keyboard-dismiss'));
    expect(dismiss).toHaveBeenCalled();
  });
});
