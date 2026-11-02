import { Stack } from 'expo-router';
import { useStackScreenOptions } from '@/navigation/useStackScreenOptions';

/**
 * Hosts is a sheet over the app: this layout is its own Stack (declared as a modal in the root),
 * so list, detail, form and scanner push inside the sheet. Each screen draws its sheet bar.
 */
export default function HostsLayout() {
  return <Stack screenOptions={{ ...useStackScreenOptions(), headerShown: false }} />;
}
