import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useHostScope } from '@/console/useHostScope';
import { NewAgentScreen } from '@/features/new-agent/NewAgentScreen';
import { useNewAgentServices } from '@/features/new-agent/services';

/**
 * `/new-agent`: start an Agent. With `host`, `workspace` and `cwd` it was opened from an Agent
 * and starts a new tab beside it; without them it is the Console's New Agent, on `host` or else
 * the Host in scope.
 */
export default function NewAgentRoute() {
  const { host, workspace, cwd } = useLocalSearchParams<{
    host?: string;
    workspace?: string;
    cwd?: string;
  }>();
  const router = useRouter();
  const services = useNewAgentServices();
  const scope = useHostScope();
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
    <NewAgentScreen
      origin={origin}
      preferredHostId={host ?? scope.hostId}
      onStarted={onStarted}
      onCancel={() => router.back()}
    />
  );
}
