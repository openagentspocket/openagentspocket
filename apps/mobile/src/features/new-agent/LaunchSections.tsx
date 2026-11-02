import { RemoteHostPath, type StartAgentState, type StartAgentStore } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  Button,
  Icon,
  ListRow,
  PickerRow,
  Section,
  Text,
  TextField,
  ToggleRow,
} from '@openagentspocket/ui';
import { newAgentText } from './text';

interface SectionProps {
  store: StartAgentStore;
  state: StartAgentState;
}

const NEW_WORKSPACE = '\u0000new';
const BROWSE = '\u0000browse';
const NONE = '\u0000none';

/** The Host the Agent starts on; absent when only one Host exists or the flow has an origin. */
export function HostSection({ store, state }: SectionProps) {
  if (store.hosts.length <= 1) return null;
  return (
    <Section title={t('Host')}>
      <PickerRow
        title={t('Host')}
        value={state.selectedHostId ?? NONE}
        options={[
          ...(state.selectedHostId === undefined
            ? [{ value: NONE, label: t('Select a Host') }]
            : []),
          ...store.hosts.map((host) => ({ value: host.id, label: host.name })),
        ]}
        onChange={(value) => store.selectHost(value === NONE ? undefined : value)}
        testID="new-agent-host"
      />
    </Section>
  );
}

/** Directories of recent Agents on this Host; a tap starts a New Workspace draft there. */
export function RecentSection({ store, state }: SectionProps) {
  if (store.origin || state.recentDirectories.length === 0) return null;
  return (
    <Section
      title={t('Recent')}
      footer={t(
        'Directories of your recent Agents on this Host. Tap one to start a new Workspace there.',
      )}
    >
      {state.recentDirectories.map((directory) => (
        <ListRow
          key={directory.path}
          title={directory.name}
          subtitle={directory.displayPath}
          leading={<Icon name="folder" color="textSecondary" />}
          trailing={
            state.launchTarget === 'newWorkspace' &&
            state.newWorkspaceDirectory === directory.path ? (
              <Icon name="check" color="accent" />
            ) : undefined
          }
          onPress={() => store.applyBrowsedDirectory(directory.path)}
          testID={`recent-directory-${directory.name}`}
        />
      ))}
    </Section>
  );
}

/** Existing Workspace or a New Workspace at a browsed directory. */
export function WorkspaceSection({
  store,
  state,
  onBrowse,
}: SectionProps & { onBrowse: () => void }) {
  if (store.origin) {
    return (
      <Section
        title={t('Directory')}
        footer={t('The Agent starts in a new tab here, next to the one you opened this from.')}
      >
        <ListRow title={store.origin.cwd} testID="new-agent-origin" />
      </Section>
    );
  }
  const isNew = state.launchTarget === 'newWorkspace';
  const directory = state.newWorkspaceDirectory;
  const selected = isNew ? NEW_WORKSPACE : (store.selectedWorkspaceId ?? NONE);
  const options = [
    ...(selected === NONE ? [{ value: NONE, label: t('None reported') }] : []),
    ...store.workspaces.map((workspace) => ({ value: workspace.id, label: workspace.label })),
    ...(directory !== ''
      ? [{ value: NEW_WORKSPACE, label: RemoteHostPath.lastComponent(directory) }]
      : isNew
        ? [{ value: NEW_WORKSPACE, label: t('Home') }]
        : []),
    { value: BROWSE, label: t('New Workspace') },
  ];
  const change = (value: string) => {
    if (value === BROWSE) onBrowse();
    else if (value === NEW_WORKSPACE) store.selectNewWorkspace();
    else if (value !== NONE) store.selectExistingWorkspace(value);
  };
  return (
    <Section
      title={t('Workspace')}
      footer={
        isNew
          ? t("Creates a fresh Workspace on the Host. An empty name uses the directory's name.")
          : undefined
      }
    >
      <PickerRow
        title={t('Workspace')}
        value={selected}
        options={options}
        onChange={change}
        disabled={state.selectedHostId === undefined}
        testID="new-agent-workspace"
      />
      {isNew ? (
        <>
          <TextField
            label={t('Workspace name (optional)')}
            value={state.newWorkspaceLabel}
            onChangeText={(newWorkspaceLabel) => store.edit({ newWorkspaceLabel })}
            autoCorrect={false}
            testID="new-agent-workspace-label"
          />
          <Text variant="callout" tone="secondary" numberOfLines={2}>
            {directory === '' ? t("Directory: the Host's home directory") : directory}
          </Text>
          <Button
            kind="secondary"
            icon="folder"
            title={t('Browse Directory…')}
            onPress={onBrowse}
            testID="new-agent-browse"
          />
        </>
      ) : null}
    </Section>
  );
}

/** Run the Agent in a clean checkout instead of the workspace itself. */
export function WorktreeSection({ store, state }: SectionProps) {
  if (!store.offersWorktree) return null;
  const error = store.worktreeBranchError;
  return (
    <Section
      title={t('Worktree')}
      footer={
        error
          ? newAgentText(error)
          : state.startsInNewWorktree
            ? t(
                "A fresh checkout of the workspace's repository. Empty fields use a generated worktree/ branch off HEAD.",
              )
            : t('Run the agent in a clean checkout instead of the workspace itself.')
      }
    >
      <ToggleRow
        title={t('Start in a new worktree')}
        value={state.startsInNewWorktree}
        disabled={store.selectedWorkspaceId === undefined}
        onValueChange={(startsInNewWorktree) => store.edit({ startsInNewWorktree })}
        testID="new-agent-worktree"
      />
      {state.startsInNewWorktree ? (
        <>
          <TextField
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
            label={t('Base (optional)')}
            value={state.worktreeBase}
            onChangeText={(worktreeBase) => store.edit({ worktreeBase })}
            autoCapitalize="none"
            autoCorrect={false}
            mono
            testID="new-agent-base"
          />
        </>
      ) : null}
    </Section>
  );
}
