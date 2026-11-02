import { Stack } from 'expo-router';
import { AgentsScreen } from '@/features/agents/AgentsScreen';

/** `/agents`: Swift draws its own Home button, toolbar capsule and large title, so no stack header. */
export default function Agents({ openDetail }: { openDetail?: string }) {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AgentsScreen openDetail={openDetail} />
    </>
  );
}
