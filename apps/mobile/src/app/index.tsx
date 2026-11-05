import { useRouter } from 'expo-router';
import { Linking } from 'react-native';
import { crashStorage } from '@/diagnostics/crashStorage';
import { HomeScreen } from '@/home/HomeScreen';
import { hrefs } from '@/navigation/hrefs';
import { REPOSITORY_URL } from '@/settings/pagesRoot';

/** `/`: Home. The header capsules, the + menu and every card are drawn by HomeScreen. */
export default function Index() {
  const router = useRouter();
  return (
    <HomeScreen
      crashStorage={crashStorage}
      onAddHost={() => router.push(hrefs.addHost())}
      onSetupGuide={() => void Linking.openURL(REPOSITORY_URL)}
      onOpenSettings={() => router.push('/settings')}
      onOpenHost={(id) => router.push({ pathname: '/hosts/[id]', params: { id } })}
      onOpenAgent={(row) => router.push(hrefs.agent(row.hostId, row.agent.pane_id))}
      onNewAgent={() => router.push(hrefs.newAgent())}
      onNewTerminal={() => router.push('/new-terminal')}
      onOpenAgents={() => router.push('/agents')}
      onOpenSessions={() => router.push(hrefs.terminals())}
    />
  );
}
