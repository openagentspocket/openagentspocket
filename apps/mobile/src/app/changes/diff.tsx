import { useLocalSearchParams, useRouter } from 'expo-router';
import { FileDiffScreen } from '@/changes/FileDiffScreen';
import { deviceStorage } from '@/settings/deviceStorage';

/** `/changes/diff?agent=<id>`: the file opened from the Changes list. */
export default function FileDiffRoute() {
  const { agent } = useLocalSearchParams<{ agent?: string }>();
  const router = useRouter();
  return (
    <>
      <FileDiffScreen
        agentId={agent ?? 'demo'}
        storage={deviceStorage}
        onBack={() => router.back()}
      />
    </>
  );
}
