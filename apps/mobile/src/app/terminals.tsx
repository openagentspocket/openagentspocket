import { groupTerminals, terminalTitle } from '@openagentspocket/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useConsoleStore, useConsoleTerminals } from '@/console/hooks';
import { TerminalsListScreen } from '@/features/terminals/TerminalsListScreen';
import { hrefs } from '@/navigation/hrefs';

/** `/terminals?host=<id>`: the shell panes of every Host (or one), grouped by workspace. */
export default function TerminalsRoute() {
  const { host } = useLocalSearchParams<{ host?: string }>();
  const router = useRouter();
  const store = useConsoleStore();
  const terminals = useConsoleTerminals();
  const groups = useMemo(
    () =>
      groupTerminals(terminals.filter((terminal) => !host || terminal.hostId === host)).map(
        (group) => ({
          id: group.id,
          workspace: group.workspaceLabel,
          host: group.hostName,
          terminals: group.terminals.map((terminal) => ({
            title: terminalTitle(terminal),
            path: terminal.cwd,
          })),
          source: group,
        }),
      ),
    [terminals, host],
  );
  const newIn = (groupId: string) => {
    const group = groups.find((candidate) => candidate.id === groupId)?.source;
    if (!group) return;
    const workspace = store.workspaces(group.hostId).find((w) => w.id === group.workspaceId);
    const cwd = workspace?.checkoutPath ?? group.terminals[0]?.cwd;
    if (cwd)
      router.push(hrefs.shell({ hostId: group.hostId, workspaceId: group.workspaceId, cwd }));
  };
  const open = (rowId: string) => {
    const at = rowId.lastIndexOf(':');
    const group = groups.find((candidate) => candidate.id === rowId.slice(0, at))?.source;
    const terminal = group?.terminals[Number(rowId.slice(at + 1))];
    if (group && terminal?.cwd) router.push(hrefs.openShell({ ...terminal, cwd: terminal.cwd }));
  };
  return (
    <>
      <TerminalsListScreen
        groups={groups}
        onHome={() => router.back()}
        onNew={() => router.push('/new-terminal')}
        onOpen={open}
        onNewIn={newIn}
      />
    </>
  );
}
