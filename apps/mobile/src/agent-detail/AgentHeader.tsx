import { type ConsoleRow, type LinkNote, linkNote, rowDirectory } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { type ActionMenuItem, AgentHeader as FloatingHeader } from '@openagentspocket/ui';
import { useGitStatus } from '@/changes/useGitStatus';
import { useConversation } from '@/conversations/useConversation';
import { latencyLabel } from '@/features/hosts/hostRows';
import { useSetting } from '@/settings/SettingsProvider';
import { agentBarLabels } from './agentBarLabels';
import { headerTitles } from './headerTitles';
import { hostAgentItems, otherAgentBlocked } from './hostAgents';
import type { Surface } from './surface';
import { useAgentMode } from './useAgentMode';

interface Props {
  row: ConsoleRow;
  /** Every listed Agent: the title's menu and the Sessions dot read the current Host's. */
  rows: readonly ConsoleRow[];
  onSwitch: (row: ConsoleRow) => void;
  surface: Surface;
  onSurface: (surface: Surface) => void;
  onSidebar: () => void;
  onHome?: () => void;
  /** Changes, Files, Ports and the rest, from the route. */
  menu?: readonly ActionMenuItem[];
  onOpenChanges?: () => void;
  /** The Host is reconnecting: these rows are from an earlier snapshot. */
  stale: boolean;
  latencyMs?: number;
}

const noteText = (note: LinkNote | null) =>
  note?.kind === 'lost' ? t('Reconnecting…') : note ? latencyLabel(note.ms) : undefined;

/**
 * The floating header: Sessions circle, the title block (the conversation's title on Chat) and the
 * checkout line with the Agent's mode, one ... menu with Chat/Terminal and, on the terminal, the
 * toolbar (the folded Composer has no toggle for it).
 */
export function AgentHeader({
  row,
  rows,
  onSwitch,
  surface,
  onSurface,
  onSidebar,
  onHome,
  menu = [],
  onOpenChanges,
  stale,
  latencyMs,
}: Props) {
  const git = useGitStatus(row.hostId, rowDirectory(row), row.agent.pane_id);
  const mode = useAgentMode(row.hostId, row.agent.pane_id, row.agent.agent, row.agent.agent_status);
  const { title: recorded } = useConversation(row.hostId, row.agent.pane_id).state.snapshot
    .transcript;
  const titles = headerTitles(row, surface, recorded);
  const branch = git?.branch ?? undefined;
  const diff = git?.diff;
  const [toolbarVisible, setToolbarVisible] = useSetting('terminalToolbarVisible');
  const items: ActionMenuItem[] = [
    {
      key: 'surface-chat',
      title: t('Show Chat'),
      icon: 'chat',
      checked: surface === 'chat',
      onPress: () => onSurface('chat'),
    },
    {
      key: 'surface-terminal',
      title: t('Show Terminal'),
      icon: 'terminal',
      checked: surface === 'terminal',
      onPress: () => onSurface('terminal'),
    },
    ...(surface === 'terminal'
      ? [
          {
            key: 'terminal-toolbar',
            title: t('Toolbar'),
            icon: 'toolbar' as const,
            checked: toolbarVisible,
            onPress: () => setToolbarVisible(!toolbarVisible),
          },
        ]
      : []),
    ...menu,
  ];
  return (
    <FloatingHeader
      surface={surface}
      onSidebar={onSidebar}
      onHome={onHome}
      menu={items}
      eyebrow={titles.eyebrow}
      title={titles.title}
      // On the terminal a directory outside git still says where the Agent is.
      subtitle={surface === 'chat' || !branch ? titles.subtitle : undefined}
      branch={branch}
      diff={diff}
      onOpenChanges={onOpenChanges}
      note={noteText(linkNote(stale, latencyMs))}
      mode={mode ?? undefined}
      titleMenu={hostAgentItems(rows, row, onSwitch)}
      sidebarDot={otherAgentBlocked(rows, row)}
      labels={agentBarLabels()}
      testID="agent-header"
    />
  );
}
