import type { ConsoleRow } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { airy, HostIssueRow, makeStyles, ScreenBackground } from '@openagentspocket/ui';
import { useMemo } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useConsoleState, useConsoleStore, useStatusInbox } from '../console/hooks';
import { useHosts } from '../features/hosts/useHosts';
import { HomeTitle, NewStrip, NoHosts, useNewStripHeight } from './HomeChrome';
import { HomeHosts } from './HomeHosts';
import { HomeInbox } from './HomeInbox';
import { HomeSessions } from './HomeSessions';
import { homeLabels } from './homeLabels';
import { homeContent } from './homeModel';
import { useUsageRing } from './UsageRingSlot';
import { useHomeActions } from './useHomeActions';

const WIDE = 600;

const useStyles = makeStyles((th) => ({
  root: { flex: 1 },
  fill: { flex: 1 },
  content: { gap: airy.sectionGap },
  body: { paddingHorizontal: th.metrics.screenInset, paddingBottom: 0 },
}));

export interface HomeScreenProps {
  /** Opens the Agent's detail; unset until the detail route exists. */
  onOpenAgent?: (row: ConsoleRow) => void;
  onOpenHost?: (hostId: string) => void;
  /** Leads to adding a Host (the Hosts screen). */
  onAddHost?: () => void;
  onSetupGuide?: () => void;
  /** Opens the full Agents list. */
  onSeeAll?: () => void;
  onOpenSettings?: () => void;
  onNewAgent?: () => void;
  onNewTerminal?: () => void;
}

/** The launcher Home: title capsule, Status Inbox, Sessions strip, Host cards and the + button. */
export function HomeScreen(props: HomeScreenProps) {
  const { onOpenAgent, onOpenHost, onAddHost, onSetupGuide, onSeeAll } = props;
  const styles = useStyles();
  const { hosts, rows } = useConsoleState();
  const store = useConsoleStore();
  const inbox = useStatusInbox();
  const content = useMemo(() => homeContent(inbox, hosts), [inbox, hosts]);
  const actions = useHomeActions();
  const usage = useUsageRing();
  const columns = useWindowDimensions().width >= WIDE ? 2 : 1;
  const saved = useHosts().hosts;
  const reserved = useNewStripHeight();

  const issues = content.offlineHosts.map((host) => ({
    hostName: host.name || t('Offline'),
    kind: 'offline' as const,
  }));
  const newMenu = [
    { key: 'new-agent', title: t('New Agent'), icon: 'add', onPress: () => props.onNewAgent?.() },
    {
      key: 'new-terminal',
      title: t('New Terminal'),
      icon: 'terminal',
      onPress: () => props.onNewTerminal?.(),
    },
    { key: 'add-host', title: t('Add Host'), icon: 'server', onPress: () => onAddHost?.() },
  ] as const;
  const empty = hosts.length === 0;
  return (
    <SafeAreaView
      style={styles.root}
      edges={['top', 'left', 'right', 'bottom']}
      testID={empty ? 'home-empty' : 'home'}
    >
      <ScreenBackground />
      {empty ? (
        <>
          <HomeTitle usage={usage} onOpenSettings={props.onOpenSettings} />
          <NoHosts onAddHost={onAddHost} onSetupGuide={onSetupGuide} />
        </>
      ) : (
        <ScrollView
          style={styles.fill}
          testID="home-scroll"
          contentContainerStyle={[styles.content, { paddingBottom: reserved }]}
        >
          <HomeTitle usage={usage} onOpenSettings={props.onOpenSettings} />
          <HostIssueRow
            issues={issues}
            labels={homeLabels()}
            onOpen={(issue) => {
              const host = hosts.find((h) => h.name === issue?.hostName);
              if (host) onOpenHost?.(host.id);
            }}
          />
          <View style={styles.body}>
            <HomeInbox
              content={content}
              now={Date.now()}
              columns={columns}
              isPinned={(item) => store.isPinned(item.row.hostId, item.row.agent.pane_id)}
              onOpen={onOpenAgent ? (item) => onOpenAgent(item.row) : undefined}
              onPin={actions.pin}
              onClose={actions.close}
              onSeeAll={onSeeAll}
            />
          </View>
          <HomeSessions rows={rows} onOpen={(row) => onOpenAgent?.(row)} onSeeAll={onSeeAll} />
          <View style={styles.body}>
            <HomeHosts
              hosts={hosts}
              rows={rows}
              saved={saved}
              columns={columns}
              onOpen={onOpenHost}
            />
          </View>
        </ScrollView>
      )}
      {empty ? null : <NewStrip items={newMenu} />}
      {usage.sheet}
    </SafeAreaView>
  );
}
