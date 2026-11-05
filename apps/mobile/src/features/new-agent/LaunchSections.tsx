import { RemoteHostPath, type StartAgentState, type StartAgentStore } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { ListRow, type PickerOption, PickerRow, Section, ToggleRow } from '@openagentspocket/ui';
import { newAgentText } from './text';
import { BranchFields, WorkspaceDraftFields } from './WorkspaceFields';

export interface SectionProps {
  store: StartAgentStore;
  state: StartAgentState;
}

const NEW_WORKSPACE = '\u0000new';
const BROWSE = '\u0000browse';
const NONE = '\u0000none';
const RECENT = 'recent:';

/** The Host the Agent starts on; the row reads "Select a Host" in the accent until one is picked. */
export function HostSection({ store, state }: SectionProps) {
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

/** The workspace menu: Workspaces, Recent directories, then Browse Directory… and New Workspace. */
export function workspaceOptions(store: StartAgentStore, state: StartAgentState) {
  const isNew = state.launchTarget === 'newWorkspace';
  const directory = state.newWorkspaceDirectory;
  const selected = isNew ? NEW_WORKSPACE : (store.selectedWorkspaceId ?? NONE);
  const newLabel = directory === '' ? t('New Workspace') : RemoteHostPath.lastComponent(directory);
  const recents: PickerOption<string>[] = state.recentDirectories.slice(0, 10).map((d, index) => ({
    value: `${RECENT}${d.path}`,
    label: d.name,
    subtitle: d.displayPath,
    section: index === 0 ? t('Recent') : undefined,
  }));
  const options: PickerOption<string>[] = [
    ...(selected === NONE ? [{ value: NONE, label: t('None reported') }] : []),
    ...store.workspaces.map((workspace) => ({ value: workspace.id, label: workspace.label })),
    ...recents,
    ...(state.selectedHostId === undefined
      ? []
      : [{ value: BROWSE, label: t('Browse Directory…'), icon: 'folder', section: '' } as const]),
    { value: NEW_WORKSPACE, label: newLabel, icon: 'add' },
  ];
  return { options, selected, isNew };
}

/** Existing Workspace, a Recent directory, a browsed directory or a typed New Workspace. */
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
  const { options, selected, isNew } = workspaceOptions(store, state);
  const change = (value: string) => {
    if (value === BROWSE) onBrowse();
    else if (value === NEW_WORKSPACE) store.selectNewWorkspace();
    else if (value.startsWith(RECENT)) store.applyBrowsedDirectory(value.slice(RECENT.length));
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
        menuHeader={false}
        menuWidth={state.selectedHostId === undefined ? 224 : undefined}
        valueTone={selected === NONE ? 'tertiary' : 'accent'}
        testID="new-agent-workspace"
      />
      {isNew ? <WorkspaceDraftFields store={store} state={state} onBrowse={onBrowse} /> : null}
    </Section>
  );
}

/** Run the agent in a clean checkout instead of the workspace itself. */
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
      {state.startsInNewWorktree ? <BranchFields store={store} state={state} /> : null}
    </Section>
  );
}
