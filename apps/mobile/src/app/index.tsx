import { useRouter } from 'expo-router';
import { crashStorage } from '@/diagnostics/crashStorage';
import { useAddHostSheet } from '@/features/hosts/useAddHostSheet';
import { HomeScreen } from '@/home/HomeScreen';
import { hrefs } from '@/navigation/hrefs';

/** `/`: Home. The header capsules, the + sheet and every card are drawn by HomeScreen. */
export default function Index() {
  const router = useRouter();
  const addHost = useAddHostSheet({
    onEasyPair: () => router.push(hrefs.easyPair()),
    onAddManually: () => router.push(hrefs.hostForm()),
  });
  return (
    <>
      <HomeScreen
        crashStorage={crashStorage}
        onAddHost={addHost.open}
        onSetupGuide={() => router.push(hrefs.setupGuide())}
        onOpenSettings={() => router.push('/settings')}
        onOpenHost={(id) => router.push({ pathname: '/hosts/[id]', params: { id } })}
        onOpenAgent={(row) => router.push(hrefs.agent(row.hostId, row.agent.pane_id))}
        onNewAgent={() => router.push(hrefs.newAgent())}
        onNewTerminal={() => router.push('/new-terminal')}
        onOpenAgents={() => router.push('/agents')}
        onOpenSessions={() => router.push(hrefs.terminals())}
      />
      {addHost.sheet}
    </>
  );
}
