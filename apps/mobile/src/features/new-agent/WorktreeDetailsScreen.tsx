import {
  type BranchPresentation,
  removalErrorMessage,
  type WorktreeDetailOptions,
  WorktreeDetailStore,
  type WorktreeRemovalReceipt,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, ListRow, Screen, Section, SheetBar, useAnchor } from '@openagentspocket/ui';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { useStoreState } from '@/changes/useStoreState';
import { newAgentText } from './text';
import { useWorktreeDialogs, WORKTREE_REMOVE_ANCHOR } from './useWorktreeDialogs';

interface WorktreeDetailsScreenProps {
  options: WorktreeDetailOptions;
  /** The removal succeeded; the owner dismisses the sheet and lets the Console catch up. */
  onRemoved: (receipt: WorktreeRemovalReceipt) => void;
  onDone: () => void;
}

function branchText(branch: BranchPresentation): string {
  switch (branch.kind) {
    case 'loading':
      return t('Loading…');
    case 'named':
      return branch.name;
    case 'detached':
      return t('Detached HEAD');
    case 'unavailable':
      return t('Unavailable');
  }
}

/** console.worktree-details: the linked worktree an Agent runs in, Show Changes, and Remove. */
export function WorktreeDetailsScreen({ options, onRemoved, onDone }: WorktreeDetailsScreenProps) {
  const store = useMemo(() => new WorktreeDetailStore(options), [options]);
  const state = useStoreState(store);
  const { removalPhase, confirmation, showsFeedback } = state;

  useEffect(() => {
    void store.loadBranchIfNeeded();
  }, [store]);

  useEffect(() => {
    if (removalPhase.kind === 'removed') onRemoved(removalPhase.receipt);
  }, [removalPhase, onRemoved]);

  useWorktreeDialogs(store, confirmation, showsFeedback);

  const phaseNote =
    removalPhase.kind === 'unconfirmed'
      ? newAgentText(removalErrorMessage('outcomeUnconfirmed'))
      : removalPhase.kind === 'stale'
        ? newAgentText(removalPhase.message)
        : t('Deletes this checkout and closes its workspace. No branch is deleted.');
  const shown = store.displayedBranch;
  const removeAnchor = useAnchor(WORKTREE_REMOVE_ANCHOR);
  return (
    <Screen
      header={
        <SheetBar
          title={t('Worktree')}
          leading={{ label: t('Done'), onPress: onDone, testID: 'worktree-done' }}
        />
      }
      edges={['left', 'right', 'bottom']}
      testID="worktree-details"
    >
      <Section title={t('Linked Worktree')}>
        <ListRow title={t('Repository')} value={options.checkout.repoName} />
        <ListRow
          title={t('Branch')}
          value={branchText(shown)}
          trailing={
            shown.kind === 'unavailable' ? (
              <Button
                kind="text"
                size="small"
                title={t('Retry')}
                onPress={() => void store.retryBranch()}
                testID="worktree-retry-branch"
              />
            ) : undefined
          }
          testID="worktree-branch"
        />
        <ListRow title={t('Checkout Path')} subtitle={options.checkout.checkoutPath} subtitleMono />
      </Section>
      {store.canShowChanges ? (
        <Section>
          <ListRow
            icon="diff"
            title={t('Show Changes')}
            titleTone="accent"
            onPress={() => store.showChanges()}
            testID="worktree-show-changes"
          />
        </Section>
      ) : null}
      <Section footer={phaseNote}>
        <View ref={removeAnchor} collapsable={false}>
          <ListRow
            title={t('Remove Worktree')}
            titleTone="danger"
            disabled={!store.canRemove || removalPhase.kind === 'removing'}
            onPress={() => store.prepareConfirmation()}
            testID="worktree-remove"
          />
        </View>
      </Section>
    </Screen>
  );
}
