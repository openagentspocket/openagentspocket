import type { ConsoleRow } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  AgentCard,
  type AgentCardPresentation,
  type AgentRowLabels,
  agentRowActions,
} from '@openagentspocket/ui';
import { type Href, useRouter } from 'expo-router';
import { useEntryMenus } from '../../navigation/entryMenus';
import { agentCardModel } from './agentCardModel';

/** The agent detail route (built by the detail task). */
export function agentHref(row: Pick<ConsoleRow, 'hostId' | 'agent'>): Href {
  const path = `/agent/${encodeURIComponent(row.hostId)}/${encodeURIComponent(row.agent.pane_id)}`;
  return path as Href;
}

interface AgentRowProps {
  row: ConsoleRow;
  pinned: boolean;
  /** Name the Host on the card (a Host group has its own header). */
  showHost: boolean;
  presentation?: AgentCardPresentation;
  /** Inside a workspace card: no workspace, Host or path lines. */
  nested?: boolean;
  labels: AgentRowLabels;
  /** Name the Agent after the workspace title (two Agents share it). */
  qualify?: boolean;
  onTogglePin: (row: ConsoleRow) => void;
  onRename: (row: ConsoleRow) => void;
  onClose: (row: ConsoleRow) => void;
  onDetails: (row: ConsoleRow) => void;
}

/** One Agent card with the swipes (Pin right, Close left) and the lifted long-press menu. */
export function AgentRow({
  row,
  pinned,
  showHost,
  presentation = 'row',
  nested = false,
  labels,
  qualify = false,
  onTogglePin,
  onRename,
  onClose,
  onDetails,
}: AgentRowProps) {
  const router = useRouter();
  const entries = useEntryMenus();
  const actions = agentRowActions({
    pinned,
    labels,
    onPin: () => onTogglePin(row),
    onDetails: () => onDetails(row),
    onClose: () => onClose(row),
  });
  const [pin, details, close] = actions.menu;
  const menu = [
    ...entries.agent(row),
    ...(pin ? [pin] : []),
    ...(details ? [details] : []),
    { key: 'rename', title: t('Rename…'), icon: 'edit' as const, onPress: () => onRename(row) },
    ...(close ? [close] : []),
  ];
  return (
    <AgentCard
      testID={`agent-row-${row.agent.pane_id}`}
      agent={{ ...agentCardModel(row, showHost, nested, qualify), pinned }}
      presentation={presentation}
      labels={labels}
      menu={menu}
      leadingSwipeActions={actions.leading}
      swipeActions={actions.trailing}
      onPress={() => router.push(agentHref(row))}
    />
  );
}
