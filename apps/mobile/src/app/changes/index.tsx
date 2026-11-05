import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChangesScreen } from '@/changes/ChangesScreen';

/** `/changes?agent=<target id>`: the Changes list of an Agent's (or a directory's) Checkout. */
export default function ChangesRoute() {
  const { agent } = useLocalSearchParams<{ agent?: string }>();
  const router = useRouter();
  const agentId = agent ?? 'demo';
  return (
    <>
      <ChangesScreen
        agentId={agentId}
        onBack={() => router.back()}
        onOpenFile={() => router.push({ pathname: '/changes/diff', params: { agent: agentId } })}
      />
    </>
  );
}
