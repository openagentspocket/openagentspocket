import { SettingsStore } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { OverlayHost, TerminalThemeProvider, ThemeProvider, useTheme } from '@openagentspocket/ui';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ConnectionsProvider } from '@/connections/ConnectionsProvider';
import { bindDemoModeStorage } from '@/connections/mode';
import { useIncomingLinks } from '@/links/useIncomingLinks';
import { useOpenAgent } from '@/links/useOpenAgent';
import { statusBarStyle } from '@/navigation/screenOptions';
import { sheetOptions } from '@/navigation/sheetOptions';
import { useStackScreenOptions } from '@/navigation/useStackScreenOptions';
import { InAppBanner } from '@/notifications/InAppBanner';
import { AppLockCover } from '@/settings/AppLockCover';
import { deviceAuthenticator } from '@/settings/deviceAuthenticator';
import { deviceStorage } from '@/settings/deviceStorage';
import { SettingsProvider, useSettings } from '@/settings/SettingsProvider';
import { useResolvedThemeId } from '@/settings/useSettingsContext';
import { useWidgetSync } from '@/widgets/useWidgetSync';

const settingsStore = new SettingsStore(deviceStorage);
bindDemoModeStorage(deviceStorage);

/** The theme in force comes from Settings (chosen, or the Dark/Light pair for the system). */
function SettingsTheme({ children }: { children: ReactNode }) {
  const themeId = useResolvedThemeId();
  const { terminalThemeLight, terminalThemeDark } = useSettings();
  return (
    <ThemeProvider themeId={themeId}>
      <TerminalThemeProvider light={terminalThemeLight} dark={terminalThemeDark}>
        {children}
      </TerminalThemeProvider>
    </ThemeProvider>
  );
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
  const theme = useTheme();
  const options = useStackScreenOptions();
  // Routes that are sheets in the Swift app: lists open at 70% and drag to full, forms open full.
  const list = sheetOptions(theme, { detents: [0.7, 1] });
  const form = sheetOptions(theme);
  const bare = { headerShown: false } as const;
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ ...bare, title: t('Home') }} />
      <Stack.Screen name="changes" options={{ ...bare, title: t('Changes') }} />
      <Stack.Screen name="hosts" options={{ ...bare, ...list, title: t('Hosts') }} />
      <Stack.Screen name="ports" options={{ ...bare, ...list, title: t('Ports') }} />
      <Stack.Screen name="usage" options={{ title: t('Usage') }} />
      <Stack.Screen name="usage-breakdown" options={{ title: t('Usage') }} />
      <Stack.Screen name="usage-limits" options={{ title: t('Usage Limits') }} />
      <Stack.Screen name="files" options={{ ...bare, ...list, title: t('Files') }} />
      <Stack.Screen name="settings" options={{ ...bare, ...list, title: t('Settings') }} />
      <Stack.Screen name="new-agent" options={{ ...bare, ...form, title: t('New Agent') }} />
      <Stack.Screen name="new-terminal" options={{ ...bare, ...form, title: t('New Terminal') }} />
      <Stack.Screen name="worktree" options={{ ...form, title: t('Worktree') }} />
      <Stack.Screen name="__gallery" options={bare} />
      <Stack.Screen name="__atlas" options={bare} />
      <Stack.Screen name="__ssh" options={bare} />
      <Stack.Screen name="__terminal" options={bare} />
    </Stack>
  );
}

export default function RootLayout() {
  useWidgetSync();
  useIncomingLinks();
  const openAgent = useOpenAgent();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SettingsProvider store={settingsStore} authenticator={deviceAuthenticator}>
        <SettingsTheme>
          <ThemedStatusBar />
          <ConnectionsProvider>
            <InAppBanner openAgent={openAgent}>
              <AppStack />
            </InAppBanner>
          </ConnectionsProvider>
          <AppLockCover />
          <OverlayHost />
        </SettingsTheme>
      </SettingsProvider>
    </GestureHandlerRootView>
  );
}
