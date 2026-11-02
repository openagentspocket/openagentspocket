import { agentKind, type ConsoleRow, inboxTitle } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { type ActionMenuItem, Icon, ListRow, ProgramMark } from '@openagentspocket/ui';
import { type Href, useRouter } from 'expo-router';
import { statusDot } from '../../console/agentStatus';

/** The agent detail route (built by the detail task). */
export function agentHref(row: Pick<ConsoleRow, 'hostId' | 'agent'>): Href {
  const path = `/agent/${encodeURIComponent(row.hostId)}/${encodeURIComponent(row.agent.pane_id)}`;
  return path as Href;
}

interface AgentRowProps {
  row: ConsoleRow;
  pinned: boolean;
  /** Name the Host under the row (the flat list has no Host header). */
  showHost: boolean;
  onTogglePin: (row: ConsoleRow) => void;
  onRename: (row: ConsoleRow) => void;
  onClose: (row: ConsoleRow) => void;
}

export function AgentRow({ row, pinned, showHost, onTogglePin, onRename, onClose }: AgentRowProps) {
  const router = useRouter();
  const subtitle = [
    row.lastOutputSnippet,
    showHost ? row.hostName : undefined,
    row.workspaceLabel,
  ].filter((part) => part !== undefined && part !== '');
  const menu: ActionMenuItem[] = [
    {
      key: 'pin',
      title: pinned ? t('Unpin') : t('Pin'),
      icon: 'pin',
      onPress: () => onTogglePin(row),
    },
    { key: 'rename', title: t('Rename…'), icon: 'edit', onPress: () => onRename(row) },
    {
      key: 'close',
      title: t('Close'),
      icon: 'close',
      destructive: true,
      onPress: () => onClose(row),
    },
  ];
  return (
    <ListRow
      testID={`agent-row-${row.agent.pane_id}`}
      title={inboxTitle(row)}
      subtitle={subtitle.join(' · ') || undefined}
      leading={
        <ProgramMark program={agentKind(row.agent)} status={statusDot(row.agent.agent_status)} />
      }
      trailing={pinned ? <Icon name="pin" accessibilityLabel={t('Pinned')} /> : undefined}
      menu={menu}
      menuTitle={inboxTitle(row)}
      chevron
      onPress={() => router.push(agentHref(row))}
    />
  );
}
