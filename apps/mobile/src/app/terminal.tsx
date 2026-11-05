import { useLocalSearchParams, useRouter } from 'expo-router';
import { ShellTerminalScreen } from '@/features/terminals/ShellTerminalScreen';

/**
 * `/terminal?host=<id>&cwd=<absolute path>[&workspace=<id>]`: a shell on a Host in a directory.
 * Host and workspace menus link here; the shell's tab is remembered per workspace (or directory).
 */
export default function TerminalRoute() {
  const { host, cwd, workspace, label } = useLocalSearchParams<{
    host?: string;
    cwd?: string;
    workspace?: string;
    label?: string;
  }>();
  const router = useRouter();
  return (
    <>
      <ShellTerminalScreen
        key={`${host}/${workspace ?? cwd}`}
        hostId={host ?? ''}
        workspaceId={workspace}
        cwd={cwd}
        label={label}
        onClose={() => router.back()}
      />
    </>
  );
}
