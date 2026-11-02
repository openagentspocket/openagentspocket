import { t } from '@openagentspocket/i18n';
import { ActionMenuButton, type ActionMenuItem, Button } from '@openagentspocket/ui';
import { Stack, useRouter } from 'expo-router';
import { View } from 'react-native';
import { HomeScreen } from '@/home/HomeScreen';
import { UsageRingSlot } from '@/home/UsageRingSlot';
import { hrefs } from '@/navigation/hrefs';

/** `/`: Home, with the toolbar entries to Hosts and Settings and a menu for the rest. */
export default function Index() {
  const router = useRouter();
  const menu: ActionMenuItem[] = [
    {
      key: 'new-agent',
      title: t('New Agent'),
      icon: 'add',
      onPress: () => router.push(hrefs.newAgent()),
    },
    { key: 'agents', title: t('Agents'), icon: 'terminal', onPress: () => router.push('/agents') },
    { key: 'board', title: t('Board'), icon: 'sparkles', onPress: () => router.push('/board') },
    { key: 'usage', title: t('Usage'), icon: 'clock', onPress: () => router.push('/usage') },
  ];
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
              <ActionMenuButton items={menu} accessibilityLabel={t('More')} testID="toolbar-menu" />
            </View>
          ),
        }}
      />
      <HomeScreen
        onAddHost={() => router.push('/hosts/form')}
        onOpenHost={(id) => router.push({ pathname: '/hosts/[id]', params: { id } })}
        onOpenAgent={(item) => router.push(hrefs.agent(item.row.hostId, item.row.agent.pane_id))}
        onSeeAll={() => router.push('/agents')}
      />
    </>
  );
}
