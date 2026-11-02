import { t } from '@openagentspocket/i18n';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useNewAgentServices } from '@/features/new-agent/services';
import { WorktreeDetailsScreen } from '@/features/new-agent/WorktreeDetailsScreen';

/** `/worktree?host=<id>&pane=<pane id>`: Worktree Details for the linked worktree an Agent runs in. */
export default function WorktreeRoute() {
  const { host, pane } = useLocalSearchParams<{ host?: string; pane?: string }>();
  const router = useRouter();
  const services = useNewAgentServices();
  const detail = useMemo(() => {
    const options = host && pane ? services.worktreeDetail(host, pane) : undefined;
    if (!options || !host) return undefined;
    // Show Changes dismisses the sheet first, then opens Changes for the worktree directory.
    return {
      ...options,
      showChanges: services.openChanges
        ? (directory: string) => {
            router.back();
            services.openChanges?.(host, directory);
          }
        : undefined,
    };
  }, [host, pane, services, router]);
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('Worktree'), presentation: 'modal' }} />
      {detail ? (
        <WorktreeDetailsScreen
          options={detail}
          onRemoved={() => router.back()}
          onDone={() => router.back()}
        />
      ) : null}
    </>
  );
}
