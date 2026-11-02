import { t } from '@openagentspocket/i18n';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { NewAgentScreen } from '@/features/new-agent/NewAgentScreen';
import { useNewAgentServices } from '@/features/new-agent/services';

/**
 * `/new-agent`: start an Agent. With `host`, `workspace` and `cwd` it was opened from an Agent
 * and starts a new tab beside it; without them it is the Console's New Agent.
 */
export default function NewAgentRoute() {
  const { host, workspace, cwd } = useLocalSearchParams<{
    host?: string;
    workspace?: string;
    cwd?: string;
  }>();
  const router = useRouter();
  const services = useNewAgentServices();
  const origin = useMemo(
    () => (host && workspace && cwd ? { hostId: host, workspaceId: workspace, cwd } : undefined),
    [host, workspace, cwd],
  );
  const onStarted = useCallback(
    (hostId: string, paneId: string) => {
      router.back();
      services.openAgent?.(hostId, paneId);
    },
    [router, services],
  );
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('New Agent'), presentation: 'modal' }} />
      <NewAgentScreen origin={origin} onStarted={onStarted} onCancel={() => router.back()} />
    </>
  );
}
