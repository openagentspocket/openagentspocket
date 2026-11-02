import { SettingsStore } from '@openagentspocket/core';
import { OverlayHost, ThemeProvider } from '@openagentspocket/ui';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { InAppBanner } from '@/notifications/InAppBanner';
import { AppLockCover } from '@/settings/AppLockCover';
import { deviceAuthenticator } from '@/settings/deviceAuthenticator';
import { deviceStorage } from '@/settings/deviceStorage';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { useResolvedThemeId } from '@/settings/useSettingsContext';

const settingsStore = new SettingsStore(deviceStorage);

/** The theme in force comes from Settings (chosen, or the Dark/Light pair for the system). */
function SettingsTheme({ children }: { children: ReactNode }) {
  const themeId = useResolvedThemeId();
  return <ThemeProvider themeId={themeId}>{children}</ThemeProvider>;
}

export default function RootLayout() {
  return (
    <SettingsProvider store={settingsStore} authenticator={deviceAuthenticator}>
      <SettingsTheme>
        <StatusBar style="auto" />
        <InAppBanner>
          <Stack screenOptions={{ headerShown: false }} />
        </InAppBanner>
        <AppLockCover />
        <OverlayHost />
      </SettingsTheme>
    </SettingsProvider>
  );
}
