import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Tappable } from './Tappable';

describe('Tappable', () => {
  it('answers a press and passes its props on', async () => {
    const onPress = jest.fn();
    await render(
      <Tappable onPress={onPress} accessibilityRole="button" testID="tap">
        <Text>Go</Text>
      </Tappable>,
    );
    await fireEvent.press(screen.getByTestId('tap'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('accepts a style function that reads the pressed state', async () => {
    const style = jest.fn(() => ({ opacity: 1 }));
    await render(<Tappable style={style} testID="tap" />);
    expect(style).toHaveBeenCalledWith(expect.objectContaining({ pressed: false }));
  });
});
