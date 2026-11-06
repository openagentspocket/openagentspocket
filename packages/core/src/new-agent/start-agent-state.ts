import type { Text } from '../errors/text';
import type { LaunchHost, LaunchOrigin, RecentDirectory } from './ports';

export type LaunchTarget = 'existingWorkspace' | 'newWorkspace';

export type StartPhase =
  | { readonly kind: 'editing' }
  /** A launch is in flight; the screen cannot be dismissed. */
  | { readonly kind: 'starting' }
  | { readonly kind: 'failed'; readonly message: Text }
  /** The Agent's Console identity, which the owner opens after the screen dismisses. */
  | { readonly kind: 'started'; readonly hostId: string; readonly paneId: string };

export type DiscoveryState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'loaded' }
  | { readonly kind: 'failed'; readonly message: Text };

export interface StartAgentState {
  readonly selectedHostId: string | undefined;
  /** The user's explicit workspace pick; undefined follows the default. */
  readonly pickedWorkspaceId: string | undefined;
  readonly name: string;
  readonly selectedKind: string | undefined;
  readonly availableKinds: readonly string[];
  readonly arguments: string;
  readonly launchTarget: LaunchTarget;
  readonly newWorkspaceDirectory: string;
  readonly newWorkspaceLabel: string;
  readonly tabLabel: string;
  readonly startsInNewWorktree: boolean;
  readonly worktreeBranch: string;
  readonly worktreeBase: string;
  readonly phase: StartPhase;
  readonly discovery: DiscoveryState;
  readonly recentDirectories: readonly RecentDirectory[];
}

/** The fields a Host switch resets: a pick made for one Host must never target another. */
export const PER_HOST_RESET = {
  pickedWorkspaceId: undefined,
  availableKinds: [],
  selectedKind: undefined,
  discovery: { kind: 'idle' },
  recentDirectories: [],
  launchTarget: 'existingWorkspace',
  newWorkspaceDirectory: '',
  newWorkspaceLabel: '',
  startsInNewWorktree: false,
  worktreeBranch: '',
  worktreeBase: '',
} as const satisfies Partial<StartAgentState>;

export const trimmedOrUndefined = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

/** The Host a form opens on: the preferred one if it exists, else the only Host, else none. */
export function initialHostChoice(
  hosts: readonly { readonly id: string }[],
  preferredHostId?: string,
): string | undefined {
  if (hosts.some((host) => host.id === preferredHostId)) return preferredHostId;
  return hosts.length === 1 ? hosts[0]?.id : undefined;
}

/** The empty form for a Host choice: the origin's Host, else the preferred or only Host. */
export function initialStartState(
  hosts: readonly LaunchHost[],
  origin: LaunchOrigin | undefined,
  preferredHostId?: string,
): StartAgentState {
  return {
    selectedHostId: origin?.hostId ?? initialHostChoice(hosts, preferredHostId),
    name: '',
    arguments: '',
    tabLabel: '',
    phase: { kind: 'editing' },
    ...PER_HOST_RESET,
  };
}
