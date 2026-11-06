import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { renderThemed } from '../test-utils';
import { BoundedScroll } from './BoundedScroll';

describe('BoundedScroll', () => {
  it('limits its height to a share of the window', async () => {
    await renderThemed(
      <BoundedScroll>
        <Text>Long</Text>
      </BoundedScroll>,
    );
    const { style } = screen.getByTestId('bounded-scroll').props;
    expect(style.maxHeight).toBeGreaterThan(0);
    expect(screen.getByText('Long')).toBeTruthy();
  });
});
