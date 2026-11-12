import { MemoryStorage } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { ThemeProvider } from '@openagentspocket/ui';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { DemoModeNotice } from './DemoModeNotice';
import { bindDemoModeStorage, isDemoMode, setDemoMode, setDemoModeSetting } from './mode';

const show = () =>
  render(
    <ThemeProvider themeId="indigo">
      <DemoModeNotice />
    </ThemeProvider>,
  );

describe('DemoModeNotice', () => {
  beforeEach(() => bindDemoModeStorage(new MemoryStorage()));
  afterEach(() => {
    setDemoMode(undefined);
    bindDemoModeStorage(undefined);
  });

  it('draws nothing while demo mode is off', async () => {
    await show();
    expect(screen.queryByTestId('demo-mode-notice')).toBeNull();
  });

  it('shows while the demo switch is on and leaves the demo from its action', async () => {
    setDemoModeSetting(true);
    await show();
    expect(screen.getByTestId('demo-mode-notice')).toBeTruthy();
    await fireEvent.press(screen.getByText(t('Leave Demo')));
    expect(isDemoMode()).toBe(false);
    expect(screen.queryByTestId('demo-mode-notice')).toBeNull();
  });

  it('appears as soon as the switch turns on', async () => {
    await show();
    await act(() => setDemoModeSetting(true));
    expect(screen.getByTestId('demo-mode-notice')).toBeTruthy();
  });

  it('draws nothing when the demo is forced, where the switch cannot change', async () => {
    setDemoMode(true);
    await show();
    expect(screen.queryByTestId('demo-mode-notice')).toBeNull();
  });
});
