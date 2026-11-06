import type { LaunchOrigin } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Banner, type ScreenHeader } from '@openagentspocket/ui';
import { useEffect, useMemo, useState } from 'react';
import { AppScreen } from '@/navigation/AppScreen';
import { AgentSection, DetailsSections } from './AgentSections';
import { DirectoryBrowserSheet } from './DirectoryBrowserSheet';
import { HostSection, WorkspaceSection, WorktreeSection } from './LaunchSections';
import { newAgentText } from './text';
import { useStartAgent } from './useStartAgent';

interface NewAgentScreenProps {
  /** Set when opened from an Agent: its Host, workspace and directory are inherited. */
  origin?: LaunchOrigin;
  /** The Host the form opens on when no origin fixes one. */
  preferredHostId?: string;
  /** The Agent started; the owner dismisses the screen and opens it. */
  onStarted: (hostId: string, paneId: string) => void;
  onCancel: () => void;
}

/** console.start-agent: pick a Host, a launch target and an installed Agent, then start it. */
export function NewAgentScreen({
  origin,
  preferredHostId,
  onStarted,
  onCancel,
}: NewAgentScreenProps) {
  const { store, state, services } = useStartAgent(origin, preferredHostId);
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

  const bar: ScreenHeader = {
    variant: 'sheet',
    title: t('New Agent'),
    leading: {
      label: t('Cancel'),
      onPress: onCancel,
      disabled: !store.canDismiss,
      testID: 'new-agent-cancel',
    },
    trailing: [
      {
        label: t('Start'),
        onPress: () => void store.submit(),
        disabled: !store.canSubmit,
        loading: phase.kind === 'starting',
        testID: 'new-agent-start',
      },
    ],
  };

  return (
    <AppScreen header={bar} keyboardAvoiding testID="new-agent-screen">
      {phase.kind === 'failed' ? (
        <Banner tone="danger" title={newAgentText(phase.message)} testID="new-agent-failure" />
      ) : null}
      {origin ? null : <HostSection store={store} state={state} />}
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
    </AppScreen>
  );
}
