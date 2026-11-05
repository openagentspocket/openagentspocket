import type { ConsoleRow } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { airy, makeStyles } from '@openagentspocket/ui';
import { useMemo } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { HostIssues } from '@/features/hosts/HostIssues';
import { AppScreen } from '@/navigation/AppScreen';
import { useConsoleState, useConsoleStore, useStatusInbox } from '../console/hooks';
import { useHosts } from '../features/hosts/useHosts';
import { HomeTitle, NewStrip, NoHosts, useNewStripHeight } from './HomeChrome';
import { HomeHosts } from './HomeHosts';
import { HomeInbox } from './HomeInbox';
import { HomeSessions } from './HomeSessions';
import { homeContent } from './homeModel';
import { useUsageRing } from './UsageRingSlot';
import { useHomeActions } from './useHomeActions';

const WIDE = 600;

const useStyles = makeStyles((th) => ({
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
  onOpenAgents?: () => void;
  /** Opens the Sessions (terminals) list. */
  onOpenSessions?: () => void;
  onOpenSettings?: () => void;
  onNewAgent?: () => void;
  onNewTerminal?: () => void;
}

/** The launcher Home: title capsule, Status Inbox, Sessions strip, Host cards and the + button. */
export function HomeScreen(props: HomeScreenProps) {
  const { onOpenAgent, onOpenHost, onAddHost, onSetupGuide } = props;
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

  const newMenu = [
    {
      key: 'new-agent',
      title: t('New Agent'),
      subtitle: t('Start an agent on one of your Hosts.'),
      icon: 'add',
      onPress: () => props.onNewAgent?.(),
    },
    {
      key: 'new-terminal',
      title: t('New Terminal'),
      subtitle: t('Open a shell on one of your Hosts.'),
      icon: 'terminal',
      onPress: () => props.onNewTerminal?.(),
    },
    {
      key: 'add-host',
      title: t('Add Host'),
      subtitle: t('Pair a computer with a QR code or add it by hand.'),
      icon: 'server',
      onPress: () => onAddHost?.(),
    },
  ] as const;
  const empty = hosts.length === 0;
  return (
    <AppScreen bare scroll={false} testID={empty ? 'home-empty' : 'home'}>
      {empty ? (
        <>
          <HomeTitle
            usage={usage}
            onOpenSettings={props.onOpenSettings}
            onOpenAgents={props.onOpenAgents}
            onOpenSessions={props.onOpenSessions}
          />
          <NoHosts onAddHost={onAddHost} onSetupGuide={onSetupGuide} />
        </>
      ) : (
        <ScrollView
          style={styles.fill}
          testID="home-scroll"
          contentContainerStyle={[styles.content, { paddingBottom: reserved }]}
        >
          <HomeTitle
            usage={usage}
            onOpenSettings={props.onOpenSettings}
            onOpenAgents={props.onOpenAgents}
            onOpenSessions={props.onOpenSessions}
          />
          <HostIssues />
          <View style={styles.body}>
            <HomeInbox
              content={content}
              now={Date.now()}
              columns={columns}
              isPinned={(item) => store.isPinned(item.row.hostId, item.row.agent.pane_id)}
              onOpen={onOpenAgent ? (item) => onOpenAgent(item.row) : undefined}
              onPin={actions.pin}
              onClose={actions.close}
            />
          </View>
          <HomeSessions rows={rows} onOpen={(row) => onOpenAgent?.(row)} />
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
    </AppScreen>
  );
}
