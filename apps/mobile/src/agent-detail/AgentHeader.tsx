import {
  agentDisplayName,
  type ConsoleRow,
  type LinkNote,
  linkNote,
  rowDirectory,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { type ActionMenuItem, AgentHeader as FloatingHeader } from '@openagentspocket/ui';
import { useGitStatus } from '@/changes/useGitStatus';
import { latencyLabel } from '@/features/hosts/hostRows';
import { useSetting } from '@/settings/SettingsProvider';
import { agentBarLabels } from './agentBarLabels';
import { hostAgentItems, otherAgentBlocked } from './hostAgents';
import type { Surface } from './surface';

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
  /** Chat is full-bleed with circles only, as in Swift; the terminal shows the title block. */
  showTitle?: boolean;
}

const tail = (path: string | undefined) => path?.split('/').filter(Boolean).at(-1);

const noteText = (note: LinkNote | null) =>
  note?.kind === 'lost' ? t('Reconnecting…') : note ? latencyLabel(note.ms) : undefined;

/**
 * The floating header: Sessions circle, the Agent's title block and checkout line, one ... menu
 * with Chat/Terminal and, on the terminal, the toolbar (the folded Composer has no toggle for it).
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
  showTitle = true,
}: Props) {
  const git = useGitStatus(row.hostId, rowDirectory(row), row.agent.pane_id);
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
      eyebrow={showTitle ? [row.hostName, row.agent.agent].filter(Boolean).join(' · ') : undefined}
      title={showTitle ? agentDisplayName(row.agent) : undefined}
      subtitle={
        // A directory outside git still says where the Agent is.
        showTitle && !branch
          ? [row.workspaceLabel, tail(rowDirectory(row))].filter(Boolean).join(' · ')
          : undefined
      }
      branch={branch}
      diff={diff}
      onOpenChanges={onOpenChanges}
      note={noteText(linkNote(stale, latencyMs))}
      titleMenu={showTitle ? hostAgentItems(rows, row, onSwitch) : undefined}
      sidebarDot={otherAgentBlocked(rows, row)}
      labels={agentBarLabels()}
      testID="agent-header"
    />
  );
}
