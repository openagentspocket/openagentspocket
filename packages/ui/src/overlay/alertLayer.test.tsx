import { fireEvent, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { confirm, OverlayHost } from '../index';
import { ask, renderThemed } from '../test-utils';

// iOS: the window-level overlay react-native-screens provides, faked as a marked View.
jest.mock('./loadWindowOverlay', () => ({
  loadWindowOverlay: () =>
    function FakeWindowOverlay({ children }: { children: ReactNode }) {
      const { View: RNView } = jest.requireActual('react-native');
      return <RNView testID="window-overlay">{children}</RNView>;
    },
}));

describe('AlertLayer', () => {
  it('draws an alert in the window overlay, over route and native sheets', async () => {
    await renderThemed(
      <View>
        <OverlayHost />
      </View>,
    );
    expect(screen.queryByTestId('window-overlay')).toBeNull();
    const { answer } = await ask(() =>
      confirm({ title: 'Trust this Host?', confirmLabel: 'Trust' }),
    );
    const overlay = screen.getByTestId('window-overlay');
    expect(within(overlay).getByTestId('alert-alert')).toBeTruthy();

    await fireEvent.press(within(overlay).getByTestId('alert-cancel'));
    await expect(answer).resolves.toBe(false);
    expect(screen.queryByTestId('window-overlay')).toBeNull();
  });
});
