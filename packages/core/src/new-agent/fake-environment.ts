import type { ConsoleWorkspace } from '../console/row';
import type { LaunchDestination, LaunchRequest, NewAgentEnvironment, StartedAgent } from './ports';

export interface RecordedStart {
  readonly request: LaunchRequest;
  readonly destination: LaunchDestination;
  readonly hostId: string;
}

/**
 * A scripted `NewAgentEnvironment` for tests and previews: Hosts with workspaces, installed kinds
 * and a home directory; every launch is recorded and answered with `startResult`, `startError`
 * (rejects) or, while `gate` is set, only after the gate opens.
 */
export class FakeNewAgentEnvironment implements NewAgentEnvironment {
  readonly workspacesByHost = new Map<string, readonly ConsoleWorkspace[]>();
  readonly namesByHost = new Map<string, ReadonlySet<string>>();
  readonly liveDirectoriesByHost = new Map<string, readonly string[]>();
  kinds: readonly string[] = ['claude'];
  kindsError: unknown;
  home: string | Error = '/home/you';
  startResult: StartedAgent = { paneId: 'w1:pnew', workspaceId: 'w1' };
  startError: unknown;
  gate: Promise<void> | undefined;
  readonly starts: RecordedStart[] = [];
  readonly visibleWaits: [string, string][] = [];
  discoveries = 0;

  workspaces(hostId: string): readonly ConsoleWorkspace[] {
    return this.workspacesByHost.get(hostId) ?? [];
  }

  existingAgentNames(hostId: string): ReadonlySet<string> {
    return this.namesByHost.get(hostId) ?? new Set();
  }

  liveDirectories(hostId: string): readonly string[] {
    return this.liveDirectoriesByHost.get(hostId) ?? [];
  }

  async discoverAgentKinds(): Promise<readonly string[]> {
    this.discoveries += 1;
    if (this.kindsError !== undefined) throw this.kindsError;
    return this.kinds;
  }

  async remoteHome(): Promise<string> {
    if (this.home instanceof Error) throw this.home;
    return this.home;
  }

  async start(
    request: LaunchRequest,
    destination: LaunchDestination,
    hostId: string,
  ): Promise<StartedAgent> {
    this.starts.push({ request, destination, hostId });
    await this.gate;
    if (this.startError !== undefined) throw this.startError;
    return this.startResult;
  }

  async awaitAgentVisible(hostId: string, paneId: string): Promise<void> {
    this.visibleWaits.push([hostId, paneId]);
  }
}
