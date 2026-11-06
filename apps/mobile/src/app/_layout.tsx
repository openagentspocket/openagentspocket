import { t } from '@openagentspocket/i18n';
import {
  OverlayHost,
  TerminalThemeProvider,
  ThemeProvider,
  useTheme,
  withAlpha,
} from '@openagentspocket/ui';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { type ReactNode, useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ConnectionsProvider } from '@/connections/ConnectionsProvider';
import { bindDemoModeStorage } from '@/connections/mode';
import { recordUncaughtErrors } from '@/diagnostics/crashStorage';
import { useIncomingLinks } from '@/links/useIncomingLinks';
import { useOpenAgent } from '@/links/useOpenAgent';
import { statusBarStyle } from '@/navigation/screenOptions';
import { sheetOptions } from '@/navigation/sheetOptions';
import { useStackScreenOptions } from '@/navigation/useStackScreenOptions';
import { ApprovalActions } from '@/notifications/ApprovalActions';
import { InAppBanner } from '@/notifications/InAppBanner';
import { useNotificationTaps } from '@/notifications/useNotificationTaps';
import { AppLockCover } from '@/settings/AppLockCover';
import { deviceAuthenticator } from '@/settings/deviceAuthenticator';
import { settingsStore } from '@/settings/deviceSettings';
import { deviceStorage } from '@/settings/deviceStorage';
import { SettingsProvider, useSettings } from '@/settings/SettingsProvider';
import { useResolvedThemeId } from '@/settings/useSettingsContext';
import { useWidgetSync } from '@/widgets/useWidgetSync';

recordUncaughtErrors();
/**
 * Home is always the first screen of the root stack, also when a link opens a sheet route directly
 * (settings, hosts...): a form sheet cannot be the first screen of a native stack (the
 * router would draw it as a card), and Home pushed over a sheet would itself be drawn as a modal.
 */
export const unstable_settings = { anchor: 'index' };

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

/**
 * The root canvas: the window and the view under every stack are the theme's canvas, so a push or
 * a sheet transition never shows the system's white behind the moving screens.
 */
function RootCanvas({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.canvas);
  }, [colors.canvas]);
  return <View style={{ flex: 1, backgroundColor: colors.canvas }}>{children}</View>;
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
  // Routes that are sheets in the Swift app. They scroll and push screens, so they open full.
  const sheet = sheetOptions(theme);
  const bare = { headerShown: false } as const;
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ ...bare, title: t('Home') }} />
      {/* The Agent detail draws its own floating header; the route name must never show as a title. */}
      <Stack.Screen name="agent/[hostId]/[paneId]" options={{ ...bare, title: t('Agent') }} />
      <Stack.Screen name="changes" options={{ ...bare, title: t('Changes') }} />
      <Stack.Screen name="hosts" options={{ ...bare, ...sheet, title: t('Hosts') }} />
      <Stack.Screen name="ports" options={{ ...bare, ...sheet, title: t('Ports') }} />
      <Stack.Screen name="usage" options={{ title: t('Usage') }} />
      <Stack.Screen name="usage-breakdown" options={{ title: t('Usage') }} />
      <Stack.Screen name="usage-limits" options={{ title: t('Usage Limits') }} />
      <Stack.Screen name="files" options={{ ...bare, ...sheet, title: t('Files') }} />
      <Stack.Screen name="settings" options={{ ...bare, ...sheet, title: t('Settings') }} />
      <Stack.Screen name="new-agent" options={{ ...bare, ...sheet, title: t('New Agent') }} />
      <Stack.Screen name="new-terminal" options={{ ...bare, ...sheet, title: t('New Terminal') }} />
      <Stack.Screen name="worktree" options={{ ...sheet, title: t('Worktree') }} />
      <Stack.Screen name="terminals" options={{ ...bare, title: t('Terminals') }} />
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
  useNotificationTaps();
  const openAgent = useOpenAgent();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SettingsProvider store={settingsStore} authenticator={deviceAuthenticator}>
        <SettingsTheme>
          <RootCanvas>
            <ThemedStatusBar />
            <ConnectionsProvider>
              <ApprovalActions />
              <InAppBanner openAgent={openAgent}>
                <AppStack />
              </InAppBanner>
            </ConnectionsProvider>
            <AppLockCover />
            <OverlayHost />
          </RootCanvas>
        </SettingsTheme>
      </SettingsProvider>
    </GestureHandlerRootView>
  );
}
