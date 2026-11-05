import type { StartAgentState, StartAgentStore } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { ListRow, TextField } from '@openagentspocket/ui';
import { newAgentText } from './text';

interface FieldsProps {
  store: StartAgentStore;
  state: StartAgentState;
}

/** The New Workspace rows: an optional name and the directory it will live in (opens the browser). */
export function WorkspaceDraftFields({
  store,
  state,
  onBrowse,
}: FieldsProps & { onBrowse: () => void }) {
  const directory = state.newWorkspaceDirectory;
  return (
    <>
      <TextField
        inline
        label={t('Workspace name (optional)')}
        value={state.newWorkspaceLabel}
        onChangeText={(newWorkspaceLabel) => store.edit({ newWorkspaceLabel })}
        autoCorrect={false}
        testID="new-agent-workspace-label"
      />
      <ListRow
        title={t('Directory')}
        value={directory === '' ? t('Home') : directory}
        chevron
        onPress={onBrowse}
        testID="new-agent-browse"
      />
    </>
  );
}

/** Branch and base of a new worktree, as rows of the Worktree card. */
export function BranchFields({ store, state }: FieldsProps) {
  const error = store.worktreeBranchError;
  return (
    <>
      <TextField
        inline
        label={t('Branch (optional)')}
        value={state.worktreeBranch}
        onChangeText={(worktreeBranch) => store.edit({ worktreeBranch })}
        error={error ? newAgentText(error) : undefined}
        autoCapitalize="none"
        autoCorrect={false}
        mono
        testID="new-agent-branch"
      />
      <TextField
        inline
        label={t('Base (optional)')}
        value={state.worktreeBase}
        onChangeText={(worktreeBase) => store.edit({ worktreeBase })}
        autoCapitalize="none"
        autoCorrect={false}
        mono
        testID="new-agent-base"
      />
    </>
  );
}
