import type { WorktreeDetailState, WorktreeDetailStore } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { confirm, copyToClipboard } from '@openagentspocket/ui';
import { useEffect } from 'react';
import { newAgentText } from './text';

/** The remove confirmation and the refusal feedback of Worktree Details, as dialogs. */
export function useWorktreeDialogs(
  store: WorktreeDetailStore,
  confirmation: WorktreeDetailState['confirmation'],
  showsFeedback: boolean,
) {
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
}
