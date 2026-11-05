import { FakeUsageSource } from '@openagentspocket/core';
import { ThemeProvider } from '@openagentspocket/ui';
import { render, screen, waitFor } from '@testing-library/react-native';
import { ProviderUsageList } from './ProviderUsageList';
import { useProviderUsage } from './useProviderUsage';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));

function Probe({ source }: { source: FakeUsageSource }) {
  const { cards, footer } = useProviderUsage(source);
  return <ProviderUsageList cards={cards} footer={footer} />;
}

describe('useProviderUsage', () => {
  it('shows one card per provider the Host reports, with the Updated footer', async () => {
    await render(
      <ThemeProvider themeId="indigo">
        <Probe source={new FakeUsageSource()} />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getAllByTestId(/^provider-card-/).length).toBeGreaterThan(0));
    const ids = screen.getAllByTestId(/^provider-card-/).map((n) => n.props.testID);
    expect(ids.some((id: string) => id.endsWith('/claude'))).toBe(true);
    expect(ids.some((id: string) => id.endsWith('/codex'))).toBe(true);
    expect(screen.getByTestId('provider-usage-footer')).toBeTruthy();
  });

  it('renders on an engine without Intl.RelativeTimeFormat (Hermes)', async () => {
    const intl = Intl as unknown as { RelativeTimeFormat?: unknown };
    const real = intl.RelativeTimeFormat;
    intl.RelativeTimeFormat = undefined;
    try {
      await render(
        <ThemeProvider themeId="indigo">
          <Probe source={new FakeUsageSource()} />
        </ThemeProvider>,
      );
      await waitFor(() => expect(screen.getByTestId('provider-usage-footer')).toBeTruthy());
    } finally {
      intl.RelativeTimeFormat = real;
    }
  });
});
