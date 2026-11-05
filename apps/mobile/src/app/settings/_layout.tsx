import { t } from '@openagentspocket/i18n';
import { Stack } from 'expo-router';
import { useStackScreenOptions } from '@/navigation/useStackScreenOptions';

/**
 * Settings is a sheet with its own stack: the root page draws its own Done capsule and large title
 * (no native header); every page it pushes keeps the sheet and gets an inline title and a back button.
 * The sheet presentation itself is declared once in the root stack.
 */
export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ ...useStackScreenOptions(), title: t('Settings') }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="agent-fields/[host]" options={{ title: '' }} />
      <Stack.Screen name="notifications" options={{ title: t('Notifications') }} />
      <Stack.Screen
        name="notification-privacy"
        options={{ title: t('How notifications stay private') }}
      />
    </Stack>
  );
}
