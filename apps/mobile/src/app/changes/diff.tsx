import { Stack, useLocalSearchParams } from 'expo-router';
import { FileDiffScreen } from '@/changes/FileDiffScreen';

/** `/changes/diff?agent=<id>`: the file opened from the Changes list. */
export default function FileDiffRoute() {
  const { agent } = useLocalSearchParams<{ agent?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: '' }} />
      <FileDiffScreen agentId={agent ?? 'demo'} />
    </>
  );
}
