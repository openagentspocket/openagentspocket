import { groupTerminals, terminalTitle } from '@openagentspocket/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { useConsoleStore, useConsoleTerminals } from '@/console/hooks';
import { useHostScope } from '@/console/useHostScope';
import { TerminalsListScreen } from '@/features/terminals/TerminalsListScreen';
import { hrefs } from '@/navigation/hrefs';

/** `/terminals?host=<id>`: the shell panes in the Host scope, grouped by workspace; `host` sets that scope. */
export default function TerminalsRoute() {
  const { host } = useLocalSearchParams<{ host?: string }>();
  const router = useRouter();
  const store = useConsoleStore();
  const terminals = useConsoleTerminals();
  const scope = useHostScope();
  const { hostId, setHostId } = scope;
  useEffect(() => {
    if (host) setHostId(host);
  }, [host, setHostId]);
  const groups = useMemo(
    () =>
      groupTerminals(terminals.filter((terminal) => !hostId || terminal.hostId === hostId)).map(
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
    [terminals, hostId],
  );
  const newIn = (groupId: string) => {
    const group = groups.find((candidate) => candidate.id === groupId)?.source;
    if (!group) return;
    const workspace = store.workspaces(group.hostId).find((w) => w.id === group.workspaceId);
    const cwd = workspace?.directory ?? group.terminals[0]?.cwd;
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
        hostItems={scope.items}
        hostLabel={scope.label}
        onShowAllHosts={hostId ? () => setHostId(undefined) : undefined}
        onHome={() => router.back()}
        onNew={() => router.push('/new-terminal')}
        onOpen={open}
        onNewIn={newIn}
      />
    </>
  );
}
