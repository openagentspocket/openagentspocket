import { rowKey, type StatusInboxItem } from '@openagentspocket/core';
import { type AppKey, t } from '@openagentspocket/i18n';
import {
  Button,
  EmptyState,
  Screen,
  SectionHeader,
  SkeletonRows,
  type Status,
  Text,
} from '@openagentspocket/ui';
import { Fragment, useMemo } from 'react';
import { useConsoleState, useStatusInbox } from '../console/hooks';
import { useEntryMenus } from '../navigation/entryMenus';
import { HostCard } from './HostCard';
import { type HomeInboxSection, homeContent } from './homeModel';
import { InboxCard } from './InboxCard';

const TITLES = {
  needsYou: { title: 'Needs you', status: 'blocked' },
  working: { title: 'Working', status: 'working' },
  doneRecent: { title: 'Done', status: 'done' },
} as const satisfies Record<HomeInboxSection['section'], { title: AppKey; status: Status }>;

export interface HomeScreenProps {
  /** Opens the Agent's detail; unset until the detail route exists. */
  onOpenAgent?: (item: StatusInboxItem) => void;
  onOpenHost?: (hostId: string) => void;
  /** Leads to adding a Host (the Hosts screen). */
  onAddHost?: () => void;
  /** Opens the full Agents list. */
  onSeeAll?: () => void;
}

/** The launcher Home: the Status Inbox (Needs you, Working, Done), idle count and Host cards. */
export function HomeScreen({ onOpenAgent, onOpenHost, onAddHost, onSeeAll }: HomeScreenProps) {
  const { hosts, rows } = useConsoleState();
  const inbox = useStatusInbox();
  const content = useMemo(() => homeContent(inbox, hosts), [inbox, hosts]);
  const now = Date.now();
  const menus = useEntryMenus();

  if (hosts.length === 0) {
    return (
      <Screen testID="home-empty">
        <EmptyState
          icon="server"
          title={t('No Hosts')}
          message={t('Add a Host to start an Agent and view its live terminal.')}
          actions={
            <Button
              icon="add"
              title={t('Add Host')}
              onPress={() => onAddHost?.()}
              testID="home-add-host"
            />
          }
        />
      </Screen>
    );
  }

  return (
    <Screen testID="home">
      {content.offlineHosts.map((host) => (
        <Text key={host.id} variant="callout" tone="secondary" testID={`offline-${host.id}`}>
          {`${host.name}: ${t('Offline')}`}
        </Text>
      ))}
      {content.isLoading && content.isQuiet ? (
        <SkeletonRows rows={2} accessibilityLabel={t('Loading Agents…')} />
      ) : content.isQuiet ? (
        <Text variant="body" tone="secondary" testID="home-quiet">
          {t('All quiet. Nothing needs you.')}
        </Text>
      ) : (
        content.sections.map(({ section, items, total }) => (
          <Fragment key={section}>
            <SectionHeader
              title={t(TITLES[section].title)}
              status={TITLES[section].status}
              count={total}
              action={
                total > items.length && onSeeAll
                  ? { title: t('See all'), onPress: onSeeAll }
                  : undefined
              }
            />
            {items.map((item) => (
              <InboxCard key={rowKey(item.row)} item={item} now={now} onOpen={onOpenAgent} />
            ))}
          </Fragment>
        ))
      )}
      {content.idleCount > 0 ? (
        <Text variant="footnote" tone="secondary" testID="home-idle">
          {t('%lld idle', content.idleCount)}
        </Text>
      ) : null}
      <SectionHeader title={t('Hosts')} />
      {hosts.map((host) => (
        <HostCard
          key={host.id}
          host={host}
          agentCount={rows.filter((row) => row.hostId === host.id).length}
          onOpen={(id) => onOpenHost?.(id)}
          menu={menus.host(host)}
        />
      ))}
    </Screen>
  );
}
