import type { ConsoleRow, ListGroup } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { confirm, EmptyState, makeStyles, Screen } from '@openagentspocket/ui';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { hrefs } from '../../navigation/hrefs';
import { HostIssues } from '../hosts/HostIssues';
import { AgentGroup } from './AgentGroup';
import { agentHref } from './AgentRow';
import { AgentsToolbar } from './AgentsToolbar';
import { agentActions } from './agentActions';
import { agentRowLabels } from './agentRowLabels';
import { QuickDetailSheet } from './QuickDetailSheet';
import { RenameSheet } from './RenameSheet';
import { useAgentsList } from './useAgentsList';

/** Workspace labels shared by several visible Agents: those rows name their Agent after the title. */
function duplicateWorkspaces(groups: readonly ListGroup[]): ReadonlySet<string> {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const row of groups.flatMap((group) => group.rows)) {
    const label = row.workspaceLabel;
    if (label === undefined) continue;
    (seen.has(label) ? dupes : seen).add(label);
  }
  return dupes;
}

const useStyles = makeStyles((theme) => ({
  groups: { gap: theme.spacing.xs },
}));

/** The Agents list: toolbar, large title and search, then the chosen presentation of the cards. The props are atlas start states: a pane id to open its detail or Rename sheet, a search query. */
export function AgentsScreen(props: {
  openDetail?: string;
  openRename?: string;
  initialQuery?: string;
}) {
  const { openDetail, openRename, initialQuery } = props;
  const styles = useStyles();
  const router = useRouter();
  const list = useAgentsList();
  const labels = useMemo(agentRowLabels, []);
  const actions = useMemo(() => agentActions(list.store), [list.store]);
  const [renaming, setRenaming] = useState<ConsoleRow | undefined>();
  const [searchOpen, setSearchOpen] = useState(initialQuery !== undefined);
  const [detailId, setDetailId] = useState(openDetail);
  const detail = list.groups
    .flatMap((group) => group.rows)
    .find((row) => row.agent.pane_id === detailId);
  const setDetail = (row: ConsoleRow | undefined) => setDetailId(row?.agent.pane_id);

  // biome-ignore lint/correctness/useExhaustiveDependencies: atlas start state, applied once
  useEffect(() => {
    if (initialQuery) list.setQuery(initialQuery);
    if (openRename) {
      setRenaming(list.groups.flatMap((g) => g.rows).find((r) => r.agent.pane_id === openRename));
    }
  }, []);

  const close = async (row: ConsoleRow) => {
    const name = row.agent.name ?? row.agent.agent ?? row.agent.pane_id;
    const ok = await confirm({
      title: t('Close %@?', name),
      message: t(
        "Closes this pane. Anything running in it stops. The tab's other panes stay open.",
      ),
      confirmLabel: t('Close Pane'),
      destructive: true,
    });
    if (ok) await actions.close(row).catch(() => undefined);
  };
  const save = (row: ConsoleRow, name: string) => {
    setRenaming(undefined);
    actions.rename(row, name).catch(() => undefined);
  };
  const isPinned = (row: ConsoleRow) => list.store.isPinned(row.hostId, row.agent.pane_id);
  const qualified = useMemo(() => duplicateWorkspaces(list.groups), [list.groups]);
  const empty = list.groups.every((group) => group.rows.length === 0);
  return (
    <Screen
      edges={['right', 'bottom', 'left']}
      testID="agents-screen"
      onRefresh={() => setSearchOpen(true)}
    >
      <AgentsToolbar
        hosts={list.hosts}
        hostId={list.hostId}
        onHost={list.setHostId}
        presentation={list.presentation}
        onPresentation={list.setPresentation}
        query={list.query}
        searchOpen={searchOpen}
        onQuery={list.setQuery}
        onHome={() => router.back()}
        onCloseSearch={() => {
          setSearchOpen(false);
          list.setQuery('');
        }}
        onNew={() => router.push(hrefs.newAgent())}
      />
      <HostIssues />
      <View style={styles.groups}>
        {list.groups.map((group) => (
          <AgentGroup
            key={group.id}
            group={group}
            hosts={list.hosts}
            collapsed={list.collapsed}
            query={list.query}
            labels={labels}
            qualified={qualified}
            isPinned={isPinned}
            onToggle={list.toggle}
            onTogglePin={actions.togglePin}
            onRename={setRenaming}
            onClose={(row) => void close(row)}
            onDetails={setDetail}
          />
        ))}
      </View>
      {empty ? (
        <EmptyState
          title={list.hasAgents ? t('No Agents Found') : t('No Agents')}
          layout={list.hasAgents ? 'compact' : 'fill'}
        />
      ) : null}
      <QuickDetailSheet
        row={detail}
        pinned={detail ? isPinned(detail) : false}
        labels={labels}
        onClose={() => setDetail(undefined)}
        onOpen={(row) => {
          setDetail(undefined);
          router.push(agentHref(row));
        }}
        onTogglePin={(row) => {
          actions.togglePin(row);
          setDetail(undefined);
        }}
        onCloseAgent={(row) => {
          setDetail(undefined);
          void close(row);
        }}
      />
      <RenameSheet row={renaming} onClose={() => setRenaming(undefined)} onSave={save} />
    </Screen>
  );
}
