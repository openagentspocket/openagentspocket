import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { FileDiffScreen } from '@/changes/FileDiffScreen';

/** `/changes/diff?agent=<id>`: the file opened from the Changes list. */
export default function FileDiffRoute() {
  const { agent } = useLocalSearchParams<{ agent?: string }>();
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <FileDiffScreen agentId={agent ?? 'demo'} onBack={() => router.back()} />
    </>
  );
}
