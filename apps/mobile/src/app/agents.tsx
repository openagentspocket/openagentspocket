import { Stack } from 'expo-router';
import type { ComponentProps } from 'react';
import { AgentsScreen } from '@/features/agents/AgentsScreen';

/** `/agents`: Swift draws its own Home button, toolbar capsule and large title, so no stack header. */
export default function Agents(props: ComponentProps<typeof AgentsScreen>) {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AgentsScreen {...props} />
    </>
  );
}
