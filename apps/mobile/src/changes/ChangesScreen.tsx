import {
  type ChangedFile,
  isClean,
  limitNoticeText,
  listLimitNotice,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Banner, ChangeSection, type ScreenHeader, useStoreState } from '@openagentspocket/ui';
import { useCallback, useEffect, useMemo } from 'react';
import { AppScreen } from '@/navigation/AppScreen';
import { ChangedFileRow } from './ChangedFileRow';
import { ChangesHeader } from './ChangesHeader';
import { ChangesBlockedState, ChangesNote, CleanState, TimedOutBanner } from './ChangesStates';
import { changesStoreFor, releaseChangesStore } from './registry';
import { buildSections } from './rows';
import { say } from './say';

interface ChangesScreenProps {
  agentId: string;
  /** Pushes the file diff over the list. */
  onOpenFile: (file: ChangedFile) => void;
  /** The circular back button of the bar. */
  onBack?: () => void;
  now?: () => number;
}

/** changes.list: the Checkout an Agent works in, its uncommitted files in Source Control groups. */
export function ChangesScreen({ agentId, onOpenFile, onBack, now = Date.now }: ChangesScreenProps) {
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
  const bar: ScreenHeader = {
    variant: 'sheet',
    title: say('Changes'),
    back: true,
    leading: { label: t('Back'), onPress: onBack ?? (() => {}), testID: 'changes-back' },
  };

  if (!changes) {
    return (
      <AppScreen scroll={false} header={bar} testID="changes-screen">
        <ChangesBlockedState phase={phase} onRetry={refresh} />
      </AppScreen>
    );
  }
  const notice = listLimitNotice(changes);
  return (
    <AppScreen
      header={bar}
      refreshing={state.isRefreshing}
      onRefresh={refresh}
      testID="changes-screen"
    >
      <ChangesHeader changes={changes} now={now()} possiblyIncompleteSince={state.freshness} />
      {state.timedOutKeepingContent ? <TimedOutBanner onRetry={refresh} /> : null}
      {notice ? <Banner tone="info" title={limitNoticeText(notice, say)} /> : null}
      {isClean(changes) ? <CleanState /> : null}
      {sections.map((section) => (
        <ChangeSection
          key={section.key}
          title={section.title}
          count={section.data.filter((row) => row.kind === 'file').length}
        >
          {section.data.map((row) =>
            row.kind === 'file' ? (
              <ChangedFileRow
                key={row.key}
                file={row.file}
                depth={row.depth}
                expanded={row.expanded}
                onOpen={open}
                onToggleDirectory={(file) => void store.toggleDirectory(file)}
              />
            ) : (
              <ChangesNote key={row.key} text={row.text} />
            ),
          )}
        </ChangeSection>
      ))}
    </AppScreen>
  );
}
