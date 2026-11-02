import { SettingsStore } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { OverlayHost, ThemeProvider, useTheme } from '@openagentspocket/ui';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { ConnectionsProvider } from '@/connections/ConnectionsProvider';
import { bindDemoModeStorage } from '@/connections/mode';
import { statusBarStyle } from '@/navigation/screenOptions';
import { useStackScreenOptions } from '@/navigation/useStackScreenOptions';
import { InAppBanner } from '@/notifications/InAppBanner';
import { AppLockCover } from '@/settings/AppLockCover';
import { deviceAuthenticator } from '@/settings/deviceAuthenticator';
import { deviceStorage } from '@/settings/deviceStorage';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { useResolvedThemeId } from '@/settings/useSettingsContext';
import { useWidgetSync } from '@/widgets/useWidgetSync';

const settingsStore = new SettingsStore(deviceStorage);
bindDemoModeStorage(deviceStorage);

/** The theme in force comes from Settings (chosen, or the Dark/Light pair for the system). */
function SettingsTheme({ children }: { children: ReactNode }) {
  const themeId = useResolvedThemeId();
  return <ThemeProvider themeId={themeId}>{children}</ThemeProvider>;
}

/** The status bar ink follows the app theme, not the system appearance. */
function ThemedStatusBar() {
  return <StatusBar style={statusBarStyle(useTheme().appearance)} />;
}

/**
 * Every route is declared here with its title, so a back button always names the previous screen
 * (never a route name). Folder layouts (changes, hosts, ports) own their headers; Home and the dev
 * harnesses draw none.
 */
function AppStack() {
  const options = useStackScreenOptions();
  const bare = { headerShown: false } as const;
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ ...bare, title: t('Home') }} />
      <Stack.Screen name="changes" options={{ ...bare, title: t('Changes') }} />
      <Stack.Screen name="hosts" options={{ ...bare, title: t('Hosts') }} />
      <Stack.Screen name="ports" options={{ ...bare, title: t('Ports') }} />
      <Stack.Screen name="usage" options={{ title: t('Usage') }} />
      <Stack.Screen name="usage-limits" options={{ title: t('Usage Limits') }} />
      <Stack.Screen name="files" options={{ title: t('Files') }} />
      <Stack.Screen name="settings/index" options={{ title: t('Settings') }} />
      <Stack.Screen name="settings/notifications" options={{ title: t('Notifications') }} />
      <Stack.Screen
        name="settings/notification-privacy"
        options={{ title: t('How notifications stay private') }}
      />
      <Stack.Screen name="__gallery" options={bare} />
      <Stack.Screen name="__ssh" options={bare} />
      <Stack.Screen name="__terminal" options={bare} />
    </Stack>
  );
}

export default function RootLayout() {
  useWidgetSync();
  return (
    <SettingsProvider store={settingsStore} authenticator={deviceAuthenticator}>
      <SettingsTheme>
        <ThemedStatusBar />
        <ConnectionsProvider>
          <InAppBanner>
            <AppStack />
          </InAppBanner>
        </ConnectionsProvider>
        <AppLockCover />
        <OverlayHost />
      </SettingsTheme>
    </SettingsProvider>
  );
}
