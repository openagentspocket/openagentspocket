import type { LaunchOrigin } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Banner, Button, makeStyles, Screen } from '@openagentspocket/ui';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { AgentSection, DetailsSections } from './AgentSections';
import { DirectoryBrowserSheet } from './DirectoryBrowserSheet';
import { HostSection, RecentSection, WorkspaceSection, WorktreeSection } from './LaunchSections';
import { newAgentText } from './text';
import { useStartAgent } from './useStartAgent';

const useStyles = makeStyles((t) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: t.spacing.sm,
  },
}));

interface NewAgentScreenProps {
  /** Set when opened from an Agent: its Host, workspace and directory are inherited. */
  origin?: LaunchOrigin;
  /** The Agent started; the owner dismisses the screen and opens it. */
  onStarted: (hostId: string, paneId: string) => void;
  onCancel: () => void;
}

/** console.start-agent: pick a Host, a launch target and an installed Agent, then start it. */
export function NewAgentScreen({ origin, onStarted, onCancel }: NewAgentScreenProps) {
  const { store, state, services } = useStartAgent(origin);
  const styles = useStyles();
  const [browsing, setBrowsing] = useState(false);
  const { selectedHostId } = state;
  const lister = useMemo(
    () => (selectedHostId === undefined ? undefined : services.directoryLister(selectedHostId)),
    [services, selectedHostId],
  );
  const { phase } = state;
  useEffect(() => {
    if (phase.kind === 'started') onStarted(phase.hostId, phase.paneId);
  }, [phase, onStarted]);

  return (
    <Screen edges={['left', 'right', 'bottom']} testID="new-agent-screen">
      <View style={styles.bar}>
        <Button
          kind="text"
          title={t('Cancel')}
          disabled={!store.canDismiss}
          onPress={onCancel}
          testID="new-agent-cancel"
        />
        <Button
          title={t('Start')}
          loading={phase.kind === 'starting'}
          disabled={!store.canSubmit}
          onPress={() => void store.submit()}
          testID="new-agent-start"
        />
      </View>
      {phase.kind === 'failed' ? (
        <Banner tone="danger" title={newAgentText(phase.message)} testID="new-agent-failure" />
      ) : null}
      {origin ? null : <HostSection store={store} state={state} />}
      <RecentSection store={store} state={state} />
      <WorkspaceSection store={store} state={state} onBrowse={() => setBrowsing(true)} />
      <WorktreeSection store={store} state={state} />
      <AgentSection store={store} state={state} />
      <DetailsSections store={store} state={state} />
      {lister === undefined ? null : (
        <DirectoryBrowserSheet
          visible={browsing}
          lister={lister}
          onSelect={(path) => {
            setBrowsing(false);
            store.applyBrowsedDirectory(path);
          }}
          onClose={() => setBrowsing(false)}
        />
      )}
    </Screen>
  );
}
