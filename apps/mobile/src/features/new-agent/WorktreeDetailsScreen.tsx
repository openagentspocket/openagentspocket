import {
  type BranchPresentation,
  removalErrorMessage,
  type WorktreeDetailOptions,
  WorktreeDetailStore,
  type WorktreeRemovalReceipt,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  Button,
  confirm,
  copyToClipboard,
  ListRow,
  Screen,
  Section,
  Text,
} from '@openagentspocket/ui';
import { useEffect, useMemo } from 'react';
import { useStoreState } from '@/changes/useStoreState';
import { newAgentText } from './text';

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

  useEffect(() => {
    if (!confirmation) return;
    void confirm({
      title: newAgentText(confirmation.title),
      message: newAgentText(confirmation.message),
      confirmLabel: t('Remove Worktree'),
      destructive: true,
      presentation: 'dialog',
    }).then((confirmed) => {
      const request = confirmed ? store.beginRemoval() : undefined;
      if (!request) return store.cancelConfirmation();
      return store.finishRemoval(request);
    });
  }, [confirmation, store]);

  useEffect(() => {
    if (!showsFeedback) return;
    const { refusalOffersChanges, refusalCommand } = store.getState();
    const phase = store.getState().removalPhase;
    void confirm({
      title:
        phase.kind === 'unconfirmed' ? t('Removal Unconfirmed') : t("Couldn't Remove Worktree"),
      message:
        phase.kind === 'failed' || phase.kind === 'stale' ? newAgentText(phase.message) : undefined,
      cancelLabel: t('OK'),
      actions: [
        ...(refusalOffersChanges ? [{ key: 'changes', title: t('Show Changes') }] : []),
        ...(refusalCommand ? [{ key: 'copy', title: t('Copy Command') }] : []),
      ],
    }).then((key) => {
      if (key === 'changes') return store.showChanges();
      if (key === 'copy' && refusalCommand) void copyToClipboard(refusalCommand, t('Copied'));
      store.dismissFeedback();
    });
  }, [showsFeedback, store]);

  const phaseNote =
    removalPhase.kind === 'unconfirmed'
      ? newAgentText(removalErrorMessage('outcomeUnconfirmed'))
      : removalPhase.kind === 'stale'
        ? newAgentText(removalPhase.message)
        : t('Deletes this checkout and closes its workspace. No branch is deleted.');
  const shown = store.displayedBranch;
  return (
    <Screen edges={['left', 'right', 'bottom']} testID="worktree-details">
      <Button kind="text" title={t('Done')} onPress={onDone} testID="worktree-done" />
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
        <ListRow title={t('Checkout Path')} subtitle={options.checkout.checkoutPath} />
      </Section>
      {store.canShowChanges ? (
        <Button
          kind="secondary"
          title={t('Show Changes')}
          onPress={() => store.showChanges()}
          testID="worktree-show-changes"
        />
      ) : null}
      <Button
        kind="destructive"
        title={t('Remove Worktree')}
        loading={removalPhase.kind === 'removing'}
        disabled={!store.canRemove}
        onPress={() => store.prepareConfirmation()}
        testID="worktree-remove"
      />
      <Text variant="caption" tone="secondary">
        {phaseNote}
      </Text>
    </Screen>
  );
}
