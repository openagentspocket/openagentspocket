import {
  type ConsoleRow,
  isGroupOpen,
  isSearching,
  type ListGroup,
  rowKey,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  type AgentRowLabels,
  FoldHeader,
  type FoldPill,
  type Status,
  WorkspaceCard,
} from '@openagentspocket/ui';
import { View } from 'react-native';
import type { HostSummary } from '../../console/store';
import { AgentRow } from './AgentRow';

const SECTION_TITLES = {
  needsYou: 'Needs you',
  working: 'Working',
  doneRecent: 'Done & recent',
  idle: 'Idle',
} as const;

const SECTION_STATUS: Record<keyof typeof SECTION_TITLES, Status> = {
  needsYou: 'blocked',
  working: 'working',
  doneRecent: 'done',
  idle: 'idle',
};

const PILL_ORDER: readonly Status[] = ['blocked', 'working', 'done', 'idle'];

function statusPills(rows: readonly ConsoleRow[], labels: AgentRowLabels): FoldPill[] {
  return PILL_ORDER.flatMap((status) => {
    const count = rows.filter((row) => row.agent.agent_status === status).length;
    return count > 0 ? [{ status, label: `${count} ${labels.status[status]}` }] : [];
  });
}

export interface AgentGroupProps {
  group: ListGroup;
  hosts: readonly HostSummary[];
  collapsed: ReadonlySet<string>;
  query: string;
  labels: AgentRowLabels;
  /** Workspace labels that need the Agent's name after them. */
  qualified: ReadonlySet<string>;
  isPinned: (row: ConsoleRow) => boolean;
  onToggle: (id: string) => void;
  onTogglePin: (row: ConsoleRow) => void;
  onRename: (row: ConsoleRow) => void;
  onClose: (row: ConsoleRow) => void;
  onDetails: (row: ConsoleRow) => void;
}

/** One section of the list in its presentation: status header, Host header, workspace card or flat. */
export function AgentGroup(props: AgentGroupProps) {
  const { group, labels } = props;
  const open = isGroupOpen(group.id, props.collapsed, props.query);
  const foldable = isSearching(props.query) ? undefined : () => props.onToggle(group.id);
  const rows = (presentation: 'row' | 'plain' | 'card') =>
    group.rows.map((row) => (
      <AgentRow
        key={rowKey(row)}
        row={row}
        pinned={props.isPinned(row)}
        showHost={group.kind !== 'host'}
        presentation={presentation}
        nested={presentation === 'plain'}
        labels={labels}
        qualify={row.workspaceLabel !== undefined && props.qualified.has(row.workspaceLabel)}
        onTogglePin={props.onTogglePin}
        onRename={props.onRename}
        onClose={props.onClose}
        onDetails={props.onDetails}
      />
    ));
  if (group.kind === 'workspace' && group.rows.length === 1) {
    return <View testID={`group-${group.id}`}>{rows('card')}</View>;
  }
  if (group.kind === 'workspace') {
    return (
      <View testID={`group-${group.id}`}>
        <WorkspaceCard
          workspace={{
            title: group.title ?? t('Unknown Workspace'),
            subtitle: group.rows[0]?.hostName,
            agentCount: group.rows.length,
            collapsed: !open,
          }}
          onToggle={foldable}
        >
          {rows('plain')}
        </WorkspaceCard>
      </View>
    );
  }
  if (group.kind === 'flat') return <View testID={`group-${group.id}`}>{rows('row')}</View>;
  const host = props.hosts.find((candidate) => candidate.id === group.hostId);
  return (
    <View testID={`group-${group.id}`}>
      {group.kind === 'host' ? (
        <FoldHeader
          kind="host"
          title={group.title ?? ''}
          hostTone={host?.link === 'live' || host?.link === 'resuming' ? 'success' : 'warning'}
          collapsed={!open}
          pills={statusPills(group.rows, labels)}
          onToggle={foldable}
          labels={labels}
        />
      ) : (
        <FoldHeader
          kind="status"
          title={group.section ? t(SECTION_TITLES[group.section]) : (group.title ?? '')}
          count={group.rows.length}
          collapsed={!open}
          onToggle={foldable}
          labels={labels}
          testID={`fold-${group.section ? SECTION_STATUS[group.section] : group.id}`}
        />
      )}
      {open ? rows('row') : null}
    </View>
  );
}
