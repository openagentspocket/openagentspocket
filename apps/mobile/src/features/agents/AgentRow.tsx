import { type ConsoleRow, rowDirectory } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  AgentCard,
  type AgentCardPresentation,
  type AgentRowLabels,
  agentRowActions,
} from '@openagentspocket/ui';
import { type Href, useRouter } from 'expo-router';
import { useGitStatus } from '@/changes/useGitStatus';
import { agentCardModel } from './agentCardModel';
import { useAgentMenu } from './useAgentMenu';

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
  const agentMenu = useAgentMenu();
  const git = useGitStatus(row.hostId, rowDirectory(row), row.agent.pane_id);
  const card = agentCardModel(row, showHost, nested, qualify);
  const actions = agentRowActions({
    pinned,
    labels,
    onPin: () => onTogglePin(row),
    onDetails: () => onDetails(row),
    onClose: () => onClose(row),
  });
  const menu = agentMenu(row, {
    pinned,
    labels,
    onPin: () => onTogglePin(row),
    onDetails: () => onDetails(row),
    onRename: () => onRename(row),
    onClose: () => onClose(row),
  });
  return (
    <AgentCard
      testID={`agent-row-${row.agent.pane_id}`}
      agent={{
        ...card,
        diff: git?.diff ?? card.diff,
        pinned,
        glyph: presentation === 'card' ? 'workspace' : 'program',
      }}
      presentation={presentation}
      labels={labels}
      menu={menu}
      leadingSwipeActions={actions.leading}
      swipeActions={actions.trailing}
      onPress={() => router.push(agentHref(row))}
    />
  );
}
