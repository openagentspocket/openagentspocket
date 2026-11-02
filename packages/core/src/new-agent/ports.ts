import type { ConsoleWorkspace } from '../console/row';
import type { KeyValueStorage } from '../hosts/known-hosts';

/** What starts an Agent (Swift AgentLaunchRequest). `workspaceId` is absent for a new Workspace. */
export interface LaunchRequest {
  readonly kind: string;
  readonly name: string;
  readonly arguments: readonly string[];
  readonly workspaceId?: string;
  /** Carried when the launch starts from another Agent's screen and lands in the same place. */
  readonly cwd?: string;
  readonly tabLabel?: string;
}

/**
 * The transport variant a launch dispatches. Invalid combinations (a worktree of a Workspace
 * that does not exist yet) cannot be represented.
 */
export type LaunchDestination =
  | { readonly kind: 'existingWorkspace' }
  | { readonly kind: 'newWorktree'; readonly branch?: string; readonly base?: string }
  | { readonly kind: 'newWorkspace'; readonly directory: string; readonly label?: string };

/** The Agent a launch started, as far as the form needs it. */
export interface StartedAgent {
  readonly paneId: string;
  readonly workspaceId: string;
  readonly cwd?: string;
}

/** Context inherited when the flow opens from an Agent's own screen. */
export interface LaunchOrigin {
  readonly hostId: string;
  readonly workspaceId: string;
  readonly cwd: string;
}

/** One Host the form can dispatch to. */
export interface LaunchHost {
  readonly id: string;
  readonly name: string;
}

/** Everything the form needs from the Console and the Host's transport (Swift's injected closures). */
export interface NewAgentEnvironment {
  workspaces(hostId: string): readonly ConsoleWorkspace[];
  /** Names already live on a Host, so a generated default never collides with them. */
  existingAgentNames(hostId: string): ReadonlySet<string>;
  /** Directories of the Agents the Console already shows on a Host. */
  liveDirectories(hostId: string): readonly string[];
  /** Kinds installed on the Host, in catalog order. */
  discoverAgentKinds(hostId: string): Promise<readonly string[]>;
  /** The Host's home directory, for a name-only New Workspace launch. */
  remoteHome(hostId: string): Promise<string>;
  start(
    request: LaunchRequest,
    destination: LaunchDestination,
    hostId: string,
  ): Promise<StartedAgent>;
  /** Suspends (bounded) until the started Agent is visible in the Console. */
  awaitAgentVisible(hostId: string, paneId: string): Promise<void>;
}

/** One recent project directory offered by the New Agent form. */
export interface RecentDirectory {
  readonly path: string;
  /** The path with the Host's home shortened to `~`. */
  readonly displayPath: string;
  /** The folder's own name, as the row's title. */
  readonly name: string;
}

/**
 * The "Recent" section's source (the Host probe and merge live with the Host transport). `quick`
 * answers at once from what the app knows; `refine` asks the Host and resolves to the refined list,
 * or undefined when the Host cannot answer.
 */
export interface RecentDirectories {
  quick(hostId: string, live: readonly string[]): readonly RecentDirectory[];
  refine(hostId: string, live: readonly string[]): Promise<readonly RecentDirectory[] | undefined>;
  /** Records a directory a launch went into. */
  remember(hostId: string, path: string): void;
}

/** The workspace the user last started an Agent in, per Host; the form pre-selects it. */
export interface RecentWorkspaces {
  workspaceId(hostId: string): string | undefined;
  remember(hostId: string, workspaceId: string): void;
}

const RECENT_WORKSPACES_KEY = 'recent-agent-workspaces-by-host';

/** `RecentWorkspaces` over any key-value storage. */
export class StoredRecentWorkspaces implements RecentWorkspaces {
  constructor(private readonly storage: KeyValueStorage) {}

  workspaceId(hostId: string): string | undefined {
    return this.read()[hostId];
  }

  remember(hostId: string, workspaceId: string): void {
    this.storage.set(
      RECENT_WORKSPACES_KEY,
      JSON.stringify({ ...this.read(), [hostId]: workspaceId }),
    );
  }

  private read(): Record<string, string> {
    const raw = this.storage.getString(RECENT_WORKSPACES_KEY);
    if (raw === undefined) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return {};
      return Object.fromEntries(
        Object.entries(parsed).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      );
    } catch {
      return {};
    }
  }
}

/** Recent directories for tests and previews: a fixed list and a scripted Host answer. */
export class FakeRecentDirectories implements RecentDirectories {
  readonly remembered: [string, string][] = [];
  refinement: readonly RecentDirectory[] | undefined;

  constructor(private readonly shown: readonly RecentDirectory[] = []) {}

  quick(): readonly RecentDirectory[] {
    return this.shown;
  }

  async refine(): Promise<readonly RecentDirectory[] | undefined> {
    return this.refinement;
  }

  remember(hostId: string, path: string): void {
    this.remembered.push([hostId, path]);
  }
}
