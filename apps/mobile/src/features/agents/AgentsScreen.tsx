import { type ConsoleRow, isGroupOpen, type ListGroup, rowKey } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  Card,
  confirm,
  EmptyState,
  Screen,
  SectionHeader,
  type Status,
} from '@openagentspocket/ui';
import { useMemo, useState } from 'react';
import { AgentRow } from './AgentRow';
import { AgentsToolbar } from './AgentsToolbar';
import { agentActions } from './agentActions';
import { RenameSheet } from './RenameSheet';
import { useAgentsList } from './useAgentsList';

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

function groupTitle(group: ListGroup): string | undefined {
  if (group.section) return t(SECTION_TITLES[group.section]);
  return group.kind === 'workspace' ? (group.title ?? t('Unknown Workspace')) : group.title;
}

export function AgentsScreen() {
  const list = useAgentsList();
  const actions = useMemo(() => agentActions(list.store), [list.store]);
  const [renaming, setRenaming] = useState<ConsoleRow | undefined>();

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
  const empty = list.groups.every((group) => group.rows.length === 0);

  return (
    <Screen>
      <AgentsToolbar
        hosts={list.hosts}
        hostId={list.hostId}
        onHost={list.setHostId}
        presentation={list.presentation}
        onPresentation={list.setPresentation}
        query={list.query}
        onQuery={list.setQuery}
      />
      {list.groups.map((group) => {
        const title = groupTitle(group);
        const open = isGroupOpen(group.id, list.collapsed, list.query);
        return (
          <Card key={group.id} testID={`group-${group.id}`}>
            {title !== undefined && group.kind !== 'flat' ? (
              <SectionHeader
                title={title}
                count={group.rows.length}
                status={group.section ? SECTION_STATUS[group.section] : undefined}
                expanded={open}
                onToggle={() => list.toggle(group.id)}
              />
            ) : null}
            {open
              ? group.rows.map((row) => (
                  <AgentRow
                    key={rowKey(row)}
                    row={row}
                    pinned={list.store.isPinned(row.hostId, row.agent.pane_id)}
                    showHost={group.kind !== 'host'}
                    onTogglePin={actions.togglePin}
                    onRename={setRenaming}
                    onClose={(target) => {
                      void close(target);
                    }}
                  />
                ))
              : null}
          </Card>
        );
      })}
      {empty ? <EmptyState title={list.hasAgents ? t('No Agents Found') : t('No Agents')} /> : null}
      <RenameSheet row={renaming} onClose={() => setRenaming(undefined)} onSave={save} />
    </Screen>
  );
}
