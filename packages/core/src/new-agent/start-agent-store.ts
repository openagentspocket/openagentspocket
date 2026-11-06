import { Observable } from '../changes/observable';
import type { ConsoleWorkspace } from '../console/row';
import type { Message } from '../errors/text';
import { message } from '../errors/text';
import { argumentErrorMessage, normalizeSmartPunctuation, parseArguments } from './arguments';
import { launchDestination, startedDirectory } from './launch-destination';
import { discoveryErrorMessage, homeProbeErrorMessage, launchErrorMessage } from './launch-errors';
import type {
  LaunchDestination,
  LaunchHost,
  LaunchOrigin,
  NewAgentEnvironment,
  RecentDirectories,
  RecentWorkspaces,
} from './ports';
import { RemoteHostPath } from './remote-path';
import {
  initialStartState,
  type LaunchTarget,
  PER_HOST_RESET,
  type StartAgentState,
  trimmedOrUndefined,
} from './start-agent-state';
import { agentNameError, defaultAgentName, gitBranchNameError } from './validation';

export interface StartAgentOptions {
  readonly hosts: readonly LaunchHost[];
  readonly environment: NewAgentEnvironment;
  /** Set when the flow opens from an Agent: Host, workspace and directory are decided. */
  readonly origin?: LaunchOrigin;
  /** The Host the form opens on when no origin fixes one. */
  readonly preferredHostId?: string;
  readonly recentWorkspaces: RecentWorkspaces;
  readonly recentDirectories: RecentDirectories;
}

/**
 * The New Agent form's logic: pick a Host, a launch target (an existing Workspace, a new
 * worktree of it, or a new Workspace at a remote directory), detect and select an installed Agent,
 * parse its native arguments, and dispatch through the environment. It talks only to injected
 * ports, so it is testable against a scripted Host.
 */
export class StartAgentStore extends Observable<StartAgentState> {
  readonly hosts: readonly LaunchHost[];
  readonly origin: LaunchOrigin | undefined;
  private readonly environment: NewAgentEnvironment;
  private readonly recentWorkspaces: RecentWorkspaces;
  private readonly recents: RecentDirectories;
  /** Flipped synchronously before the first await, so a double tap cannot dispatch twice. */
  private isStarting = false;

  constructor(options: StartAgentOptions) {
    const { hosts, origin } = options;
    super(initialStartState(hosts, origin, options.preferredHostId));
    this.hosts = hosts;
    this.origin = origin;
    this.environment = options.environment;
    this.recentWorkspaces = options.recentWorkspaces;
    this.recents = options.recentDirectories;
  }

  // MARK: Derived

  /** The workspaces the selected Host knows; empty when no Host is picked. */
  get workspaces(): readonly ConsoleWorkspace[] {
    const { selectedHostId } = this.getState();
    return selectedHostId === undefined ? [] : this.environment.workspaces(selectedHostId);
  }

  /**
   * The existing Workspace the agent starts in: the origin's, else the user's pick, else the one
   * last used on this Host, else the Host's first. Undefined while the Host reports none.
   */
  get selectedWorkspaceId(): string | undefined {
    if (this.origin) return this.origin.workspaceId;
    const { pickedWorkspaceId, selectedHostId } = this.getState();
    const available = this.workspaces;
    const has = (id: string | undefined) => id !== undefined && available.some((w) => w.id === id);
    if (has(pickedWorkspaceId)) return pickedWorkspaceId;
    const remembered =
      selectedHostId === undefined ? undefined : this.recentWorkspaces.workspaceId(selectedHostId);
    if (has(remembered)) return remembered;
    return available[0]?.id;
  }

  /** A worktree launch lands in a new checkout, so it excludes an origin and a new Workspace. */
  get offersWorktree(): boolean {
    return this.origin === undefined && this.getState().launchTarget === 'existingWorkspace';
  }

  get offersNewWorkspace(): boolean {
    return this.origin === undefined;
  }

  get parsedArguments() {
    return parseArguments(normalizeSmartPunctuation(this.getState().arguments));
  }

  get argumentError(): Message | undefined {
    const parsed = this.parsedArguments;
    return parsed.ok ? undefined : argumentErrorMessage(parsed.error);
  }

  /** Feedback for the name field; undefined while empty (empty means "use the default"). */
  get nameError(): Message | undefined {
    const trimmed = this.getState().name.trim();
    return trimmed === '' ? undefined : agentNameError(trimmed);
  }

  /** The name an empty field falls back to; undefined until a Host and Agent are selected. */
  get defaultName(): string | undefined {
    const { selectedHostId, selectedKind } = this.getState();
    if (selectedHostId === undefined || selectedKind === undefined) return undefined;
    return defaultAgentName(selectedKind, this.environment.existingAgentNames(selectedHostId));
  }

  get worktreeBranchError(): Message | undefined {
    const { startsInNewWorktree, worktreeBranch } = this.getState();
    const branch = worktreeBranch.trim();
    return startsInNewWorktree && branch !== '' ? gitBranchNameError(branch) : undefined;
  }

  get canSubmit(): boolean {
    const state = this.getState();
    return (
      state.selectedHostId !== undefined &&
      this.hasLaunchTarget &&
      this.nameError === undefined &&
      state.selectedKind !== undefined &&
      this.parsedArguments.ok &&
      this.worktreeBranchError === undefined &&
      state.discovery.kind === 'loaded' &&
      state.phase.kind !== 'starting'
    );
  }

  /** The sheet may be dismissed unless a launch whose outcome may be committed is in flight. */
  get canDismiss(): boolean {
    return this.getState().phase.kind !== 'starting';
  }

  private get hasLaunchTarget(): boolean {
    if (this.origin) return this.selectedWorkspaceId !== undefined;
    // A name-only New Workspace is complete as chosen: its directory resolves at submit.
    return (
      this.getState().launchTarget === 'newWorkspace' || this.selectedWorkspaceId !== undefined
    );
  }

  // MARK: Editing

  /** Plain text fields and toggles. */
  edit(
    patch: Partial<
      Pick<
        StartAgentState,
        | 'name'
        | 'arguments'
        | 'newWorkspaceDirectory'
        | 'newWorkspaceLabel'
        | 'tabLabel'
        | 'startsInNewWorktree'
        | 'worktreeBranch'
        | 'worktreeBase'
        | 'selectedKind'
      >
    >,
  ): void {
    this.set(patch);
  }

  selectHost(hostId: string | undefined): void {
    if (hostId === this.getState().selectedHostId) return;
    this.set({ selectedHostId: hostId, ...PER_HOST_RESET });
  }

  /** Switching target drops a worktree request that would have no source Workspace. */
  private setTarget(target: LaunchTarget): void {
    if (target === this.getState().launchTarget) return;
    this.set({
      launchTarget: target,
      startsInNewWorktree: false,
      worktreeBranch: '',
      worktreeBase: '',
    });
  }

  selectNewWorkspace(): void {
    if (this.offersNewWorkspace) this.setTarget('newWorkspace');
  }

  selectExistingWorkspace(id: string): void {
    if (this.origin || !this.workspaces.some((workspace) => workspace.id === id)) return;
    this.set({ pickedWorkspaceId: id });
    this.setTarget('existingWorkspace');
  }

  /** A browsed directory switches the draft to a New Workspace there; it starts nothing. */
  applyBrowsedDirectory(path: string): void {
    if (!this.offersNewWorkspace || !RemoteHostPath.isAbsolute(path)) return;
    this.set({ newWorkspaceDirectory: path });
    this.selectNewWorkspace();
  }

  // MARK: Loading

  async discoverAgents(): Promise<void> {
    const hostId = this.getState().selectedHostId;
    if (hostId === undefined) {
      this.set({ availableKinds: [], selectedKind: undefined, discovery: { kind: 'idle' } });
      return;
    }
    this.set({ availableKinds: [], selectedKind: undefined, discovery: { kind: 'loading' } });
    try {
      const kinds = await this.environment.discoverAgentKinds(hostId);
      if (this.getState().selectedHostId !== hostId) return;
      this.set({ availableKinds: kinds, selectedKind: kinds[0], discovery: { kind: 'loaded' } });
    } catch (error) {
      if (this.getState().selectedHostId !== hostId) return;
      this.set({ discovery: { kind: 'failed', message: discoveryErrorMessage(error) } });
    }
  }

  /**
   * Fills the Recent section: what the app knows at once, then the Host's refinement. Runs beside
   * the form and never blocks it. Origin launches have no directory choice, so they skip it.
   */
  async loadRecentDirectories(): Promise<void> {
    const hostId = this.getState().selectedHostId;
    if (this.origin || hostId === undefined) {
      this.set({ recentDirectories: [] });
      return;
    }
    const live = [
      ...this.workspaces.flatMap((workspace) =>
        workspace.checkoutPath === undefined ? [] : [workspace.checkoutPath],
      ),
      ...this.environment.liveDirectories(hostId),
    ];
    this.set({ recentDirectories: this.recents.quick(hostId, live) });
    const refined = await this.recents.refine(hostId, live);
    if (refined && this.getState().selectedHostId === hostId) {
      this.set({ recentDirectories: refined });
    }
  }

  // MARK: Submit

  /** Dispatches the launch. An incomplete form is ignored; success carries the Agent's identity. */
  async submit(): Promise<void> {
    const { selectedHostId: hostId, selectedKind: kind } = this.getState();
    const parsed = this.parsedArguments;
    if (
      this.isStarting ||
      hostId === undefined ||
      kind === undefined ||
      !parsed.ok ||
      this.worktreeBranchError !== undefined ||
      this.nameError !== undefined
    ) {
      return;
    }
    const name =
      trimmedOrUndefined(this.getState().name) ??
      defaultAgentName(kind, this.environment.existingAgentNames(hostId));
    this.isStarting = true;
    try {
      if (this.needsHomeDirectory && !(await this.fillHomeDirectory(hostId))) return;
      const destination = launchDestination(this.getState(), this.origin, this.selectedWorkspaceId);
      if (!destination) return;
      this.set({ phase: { kind: 'starting' } });
      const workspaceId =
        destination.kind === 'newWorkspace' ? undefined : this.selectedWorkspaceId;
      await this.launch(hostId, kind, destination, {
        kind,
        name,
        arguments: parsed.arguments,
        workspaceId,
        cwd: this.origin?.cwd,
        tabLabel: trimmedOrUndefined(this.getState().tabLabel),
      });
    } finally {
      this.isStarting = false;
    }
  }

  private async launch(
    hostId: string,
    kind: string,
    destination: LaunchDestination,
    request: Parameters<NewAgentEnvironment['start']>[0],
  ): Promise<void> {
    try {
      const agent = await this.environment.start(request, destination, hostId);
      this.recentWorkspaces.remember(
        hostId,
        destination.kind === 'newWorkspace'
          ? agent.workspaceId
          : (request.workspaceId ?? agent.workspaceId),
      );
      const directory = startedDirectory(
        destination,
        this.origin,
        this.workspaces.find((workspace) => workspace.id === this.selectedWorkspaceId),
        agent.cwd,
      );
      if (directory !== undefined) this.recents.remember(hostId, directory);
      // The wait is bounded; on timeout the owner still navigates and the row catches up.
      await this.environment.awaitAgentVisible(hostId, agent.paneId);
      this.set({ phase: { kind: 'started', hostId, paneId: agent.paneId } });
    } catch (error) {
      this.set({ phase: { kind: 'failed', message: launchErrorMessage(error, kind) } });
    }
  }

  private get needsHomeDirectory(): boolean {
    const state = this.getState();
    return (
      this.origin === undefined &&
      state.launchTarget === 'newWorkspace' &&
      trimmedOrUndefined(state.newWorkspaceDirectory) === undefined
    );
  }

  /** A name-only New Workspace falls back to the Host's home, resolved here so an unreachable Host is reported. */
  private async fillHomeDirectory(hostId: string): Promise<boolean> {
    this.set({ phase: { kind: 'starting' } });
    try {
      const home = await this.environment.remoteHome(hostId);
      // The form stays editable meanwhile; discard an answer that no longer applies.
      if (this.getState().selectedHostId !== hostId || !this.needsHomeDirectory) {
        this.set({ phase: { kind: 'editing' } });
        return false;
      }
      if (!RemoteHostPath.isAbsolute(home)) {
        this.set({
          phase: {
            kind: 'failed',
            message: message("The Host's home directory is not a usable path: %@", home),
          },
        });
        return false;
      }
      this.set({ newWorkspaceDirectory: home });
      return true;
    } catch (error) {
      this.set({ phase: { kind: 'failed', message: homeProbeErrorMessage(error) } });
      return false;
    }
  }
}
