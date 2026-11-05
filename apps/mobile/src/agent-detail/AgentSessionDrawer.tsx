import { agentDisplayName, type ConsoleRow, rowKey } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { type DrawerWorkspace, SessionDrawer, useTheme, withAlpha } from '@openagentspocket/ui';
import { type ReactNode, useMemo } from 'react';
import { Drawer } from 'react-native-drawer-layout';
import { statusDot } from '@/console/agentStatus';
import { useConsoleStore } from '@/console/hooks';
import { agentActions } from '@/features/agents/agentActions';
import { closeAgent } from '@/features/agents/closeAgent';
import { useAgentMenu } from '@/features/agents/useAgentMenu';
import { useRename } from '@/features/agents/useRename';
import { agentBarLabels } from './agentBarLabels';

interface Props {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** The Agents of the Host being viewed. */
  rows: readonly ConsoleRow[];
  current: ConsoleRow;
  onSelect: (row: ConsoleRow) => void;
  onHome?: () => void;
  /** The screen the drawer slides over. */
  children: ReactNode;
}

const WIDTH = 330;

/**
 * The left drawer around the Agent detail: this Host's Workspaces with their Agents; tapping one
 * switches in place, a long press opens the Agent's action menu. The slide, the edge swipe and the
 * scrim's fade run on the UI thread (react-native-drawer-layout over reanimated and gesture-handler).
 */
export function AgentSessionDrawer({
  open,
  onOpen,
  onClose,
  rows,
  current,
  onSelect,
  onHome,
  children,
}: Props) {
  const theme = useTheme();
  const store = useConsoleStore();
  const actions = useMemo(() => agentActions(store), [store]);
  const rename = useRename(actions);
  const menu = useAgentMenu();
  const hostRows = useMemo(
    () => rows.filter((row) => row.hostId === current.hostId),
    [rows, current.hostId],
  );
  const workspaces = useMemo(() => {
    const groups = new Map<
      string,
      DrawerWorkspace & { items: DrawerWorkspace['items'][number][] }
    >();
    for (const row of hostRows) {
      const id = row.agent.workspace_id;
      const group = groups.get(id) ?? { id, title: row.workspaceLabel ?? id, items: [] };
      group.items.push({
        id: rowKey(row),
        kind: 'agent',
        title: agentDisplayName(row.agent),
        program: row.agent.agent ?? 'unknown',
        status: statusDot(row.agent.agent_status),
      });
      groups.set(id, group);
    }
    return [...groups.values()];
  }, [hostRows]);
  const find = (id: string) => hostRows.find((candidate) => rowKey(candidate) === id);
  return (
    <>
      <Drawer
        open={open}
        onOpen={onOpen}
        onClose={onClose}
        drawerType="front"
        drawerStyle={{
          width: WIDTH,
          maxWidth: '88%',
          backgroundColor: withAlpha(theme.colors.canvas, 0),
        }}
        overlayStyle={{ backgroundColor: theme.backdrop }}
        overlayAccessibilityLabel={agentBarLabels().sidebar}
        renderDrawerContent={() => (
          <SessionDrawer
            host={{ name: current.hostName, summary: t('%lld Agents', hostRows.length) }}
            workspaces={workspaces}
            selectedId={rowKey(current)}
            onSelect={(id) => {
              const row = find(id);
              onClose();
              if (row && rowKey(row) !== rowKey(current)) onSelect(row);
            }}
            menuFor={(id) => {
              const row = find(id);
              if (!row) return [];
              return menu(row, {
                pinned: store.isPinned(row.hostId, row.agent.pane_id),
                onPin: () => store.togglePin(row.hostId, row.agent.pane_id),
                onRename: () => rename.open(row),
                onClose: () => void closeAgent(row, actions),
              });
            }}
            onHome={
              onHome
                ? () => {
                    onClose();
                    onHome();
                  }
                : undefined
            }
            labels={agentBarLabels()}
          />
        )}
      >
        {children}
      </Drawer>
      {rename.sheet}
    </>
  );
}
