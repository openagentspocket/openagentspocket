import { t } from '@openagentspocket/i18n';
import { Button } from '@openagentspocket/ui';
import { Stack, useRouter } from 'expo-router';
import { View } from 'react-native';
import { HomeScreen } from '@/home/HomeScreen';
import { UsageRingSlot } from '@/home/UsageRingSlot';

/** `/`: Home, with the toolbar entries to Hosts and Settings. */
export default function Index() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'OpenAgentsPocket',
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              <UsageRingSlot />
              <Button
                kind="text"
                icon="server"
                accessibilityLabel={t('Hosts')}
                onPress={() => router.push('/hosts')}
                testID="toolbar-hosts"
              />
              <Button
                kind="text"
                icon="settings"
                accessibilityLabel={t('Settings')}
                onPress={() => router.push('/settings')}
                testID="toolbar-settings"
              />
            </View>
          ),
        }}
      />
      <HomeScreen
        onAddHost={() => router.push('/hosts/form')}
        onOpenHost={(id) => router.push({ pathname: '/hosts/[id]', params: { id } })}
      />
    </>
  );
}
