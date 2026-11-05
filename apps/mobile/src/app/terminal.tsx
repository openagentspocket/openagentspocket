import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ShellTerminalScreen } from '@/features/terminals/ShellTerminalScreen';

/**
 * `/terminal?host=<id>&cwd=<absolute path>[&workspace=<id>]`: a shell on a Host in a directory.
 * Host and workspace menus link here; the shell's tab is remembered per workspace (or directory).
 */
export default function TerminalRoute() {
  const { host, cwd, workspace, label, pane, tab, terminal } = useLocalSearchParams<{
    host?: string;
    cwd?: string;
    workspace?: string;
    label?: string;
    pane?: string;
    tab?: string;
    terminal?: string;
  }>();
  const router = useRouter();
  const existing = useMemo(
    () =>
      pane && tab && terminal ? { paneId: pane, tabId: tab, terminalId: terminal } : undefined,
    [pane, tab, terminal],
  );
  return (
    <>
      <ShellTerminalScreen
        key={`${host}/${pane ?? workspace ?? cwd}`}
        hostId={host ?? ''}
        workspaceId={workspace}
        cwd={cwd}
        label={label}
        existing={existing}
        onClose={() => router.back()}
      />
    </>
  );
}
