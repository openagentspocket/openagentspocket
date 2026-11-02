import { t } from '@openagentspocket/i18n';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ShellTerminalScreen } from '@/features/terminals/ShellTerminalScreen';

/**
 * `/terminal?host=<id>&cwd=<absolute path>[&workspace=<id>]`: a shell on a Host in a directory.
 * Host and workspace menus link here; the shell's tab is remembered per workspace (or directory).
 */
export default function TerminalRoute() {
  const { host, cwd, workspace } = useLocalSearchParams<{
    host?: string;
    cwd?: string;
    workspace?: string;
  }>();
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('Terminal') }} />
      <ShellTerminalScreen
        key={`${host}/${workspace ?? cwd}`}
        hostId={host ?? ''}
        workspaceId={workspace}
        cwd={cwd}
        onClose={() => router.back()}
      />
    </>
  );
}
