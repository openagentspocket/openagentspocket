import { OverlayHost, ThemeProvider } from '@openagentspocket/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { UsageRingSlot } from './UsageRingSlot';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const renderSlot = () =>
  render(
    <ThemeProvider themeId="indigo">
      <UsageRingSlot />
      <OverlayHost />
    </ThemeProvider>,
  );

describe('UsageRingSlot', () => {
  beforeEach(() => mockPush.mockClear());

  it('shows the fullest running window once read, and describes it for screen readers', async () => {
    await renderSlot();
    await waitFor(() =>
      expect(screen.getByTestId('home-usage-ring').props.accessibilityValue).toBeTruthy(),
    );
  });

  it('opens the Usage sheet, and the full Usage screen from it', async () => {
    await renderSlot();
    await fireEvent.press(screen.getByTestId('home-usage-ring'));
    await waitFor(() => expect(screen.getByTestId('usage-quick-sheet')).toBeTruthy());
    await fireEvent.press(screen.getByText('Open full Usage'));
    expect(mockPush).toHaveBeenCalledWith('/usage');
  });
});
