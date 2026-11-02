import { useRouter } from 'expo-router';
import { Linking } from 'react-native';
import { HomeScreen } from '@/home/HomeScreen';
import { hrefs } from '@/navigation/hrefs';
import { REPOSITORY_URL } from '@/settings/pagesRoot';

/** `/`: Home. The title capsule, the + menu and every card are drawn by HomeScreen. */
export default function Index() {
  const router = useRouter();
  return (
    <HomeScreen
      onAddHost={() => router.push('/hosts/form')}
      onSetupGuide={() => void Linking.openURL(REPOSITORY_URL)}
      onOpenSettings={() => router.push('/settings')}
      onOpenHost={(id) => router.push({ pathname: '/hosts/[id]', params: { id } })}
      onOpenAgent={(row) => router.push(hrefs.agent(row.hostId, row.agent.pane_id))}
      onNewAgent={() => router.push(hrefs.newAgent())}
      onNewTerminal={() => router.push('/new-terminal')}
      onSeeAll={() => router.push('/agents')}
    />
  );
}
