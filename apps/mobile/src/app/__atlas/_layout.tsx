import { type ThemeId, ThemeProvider } from '@openagentspocket/ui';
import { Stack, useGlobalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogBox } from 'react-native';
import { freezeAtlasClock } from '@/dev/atlas/atlasClock';
import { useStackScreenOptions } from '@/navigation/useStackScreenOptions';

freezeAtlasClock();
// Dev warnings (web-only DOM prop notices) must not draw toasts over a capture.
LogBox.ignoreAllLogs();

const THEMES: readonly string[] = ['indigo', 'papel', 'noche'];

function AtlasStack() {
  return <Stack screenOptions={{ ...useStackScreenOptions(), headerShown: false }} />;
}

/** `/__atlas?theme=papel`: dev-only; the theme comes from the query so captures need no settings. */
export default function AtlasLayout() {
  const { theme } = useGlobalSearchParams<{ theme?: string }>();
  const themeId: ThemeId = THEMES.includes(theme ?? '') ? (theme as ThemeId) : 'indigo';
  return (
    <ThemeProvider themeId={themeId}>
      <StatusBar style={themeId === 'papel' ? 'dark' : 'light'} />
      <AtlasStack />
    </ThemeProvider>
  );
}
