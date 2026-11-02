import {
  type ChangedFile,
  isClean,
  limitNoticeText,
  listLimitNotice,
} from '@openagentspocket/core';
import { Banner, Screen, VirtualSectionList } from '@openagentspocket/ui';
import { useCallback, useEffect, useMemo } from 'react';
import { ChangedFileRow } from './ChangedFileRow';
import { ChangesHeader } from './ChangesHeader';
import { ChangesBlockedState, CleanState, TimedOutBanner } from './ChangesStates';
import { changesStoreFor, releaseChangesStore } from './registry';
import { buildSections, type ChangesRow } from './rows';
import { say } from './say';
import { useStoreState } from './useStoreState';

interface ChangesScreenProps {
  agentId: string;
  /** Pushes the file diff over the list. */
  onOpenFile: (file: ChangedFile) => void;
  now?: () => number;
}

/** changes.list: the Checkout an Agent works in, its uncommitted files in Source Control groups. */
export function ChangesScreen({ agentId, onOpenFile, now = Date.now }: ChangesScreenProps) {
  const store = changesStoreFor(agentId);
  const state = useStoreState(store);
  const { expansions } = useStoreState(store.untrackedDirectories);

  useEffect(() => {
    const release = store.followAgentStatus();
    void store.appear();
    return () => {
      release();
      releaseChangesStore(agentId);
    };
  }, [store, agentId]);

  const { phase } = state;
  const changes = phase.kind === 'loaded' ? phase.changes : null;
  const sections = useMemo(
    () => (changes ? buildSections(changes, expansions) : []),
    [changes, expansions],
  );
  const refresh = useCallback(() => void store.refresh(), [store]);
  const open = useCallback(
    (file: ChangedFile) => {
      store.openDiff(file);
      onOpenFile(file);
    },
    [store, onOpenFile],
  );

  if (!changes) {
    return (
      <Screen scroll={false} edges={['left', 'right', 'bottom']} testID="changes-screen">
        <ChangesBlockedState phase={phase} onRetry={refresh} />
      </Screen>
    );
  }
  const notice = listLimitNotice(changes);
  const header = (
    <>
      <ChangesHeader changes={changes} now={now()} possiblyIncompleteSince={state.freshness} />
      {state.timedOutKeepingContent ? <TimedOutBanner onRetry={refresh} /> : null}
      {notice ? <Banner tone="info" title={limitNoticeText(notice, say)} /> : null}
    </>
  );
  return (
    <Screen scroll={false} edges={['left', 'right', 'bottom']} testID="changes-screen">
      <VirtualSectionList<ChangesRow>
        sections={sections}
        keyExtractor={(row) => row.key}
        ListHeaderComponent={header}
        ListEmptyComponent={isClean(changes) ? <CleanState /> : undefined}
        refreshing={state.isRefreshing}
        onRefresh={refresh}
        renderItem={(row) =>
          row.kind === 'file' ? (
            <ChangedFileRow
              file={row.file}
              depth={row.depth}
              expanded={row.expanded}
              onOpen={open}
              onToggleDirectory={(file) => void store.toggleDirectory(file)}
            />
          ) : (
            <Banner tone="neutral" title={row.text} testID="changes-note" />
          )
        }
        testID="changes-list"
      />
    </Screen>
  );
}
