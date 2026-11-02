import { OverlayHost, ThemeProvider } from '@openagentspocket/ui';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
      <OverlayHost />
    </ThemeProvider>
  );
}
