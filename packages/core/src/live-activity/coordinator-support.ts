import type { Host } from '../hosts/host';
import { sealContent } from './content';
import type { CoordinatorOptions } from './coordinator-types';
import { keepingResults } from './desire';
import { openActivity } from './envelope';
import type { TokenJob } from './token-pipe';
import type { ActivityContentState, ActivityDesire } from './types';

/** Seals `desired`, keeping the tap results the running activity shows for the same prompts. */
export async function buildContent(
  o: CoordinatorOptions,
  desired: ActivityDesire,
  hostId: string,
  key: Uint8Array,
  shownActivityId: string | undefined,
): Promise<ActivityContentState | null> {
  let effective = desired;
  if (shownActivityId && desired.agents.some((agent) => agent.ask)) {
    const state = await o.controller.currentContent(shownActivityId);
    let shown: ReturnType<typeof openActivity>['agents'] | undefined;
    try {
      shown = state?.envelope ? openActivity({ ...state.envelope }, key).agents : undefined;
    } catch {
      shown = undefined;
    }
    if (shown) {
      effective = keepingResults(
        desired,
        shown,
        (paneId, episodeId) => o.isActionInFlight?.(hostId, paneId, episodeId) ?? false,
      );
    }
  }
  return sealContent(effective, key, o.randomBytes);
}

/** The first gate that kept a Host's desire from producing content, in the order they run. */
export function desireBlocker(o: CoordinatorOptions, hostId: string, hasKey: boolean) {
  if (!o.controller.areEnabled) return 'activitiesDisabled' as const;
  if (!o.preferences.isEnabled(hostId)) return 'hostToggleOff' as const;
  if (!o.deviceToken()) return 'noDeviceToken' as const;
  if (!hasKey) return 'noNotificationKey' as const;
  return 'noAgents' as const;
}

function isoSeconds(epochMs: number): string {
  return new Date(epochMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export interface WriterLookups {
  readonly host: (hostId: string) => Host | undefined;
  readonly hostName: (hostId: string) => string;
  readonly isKnown: (hostId: string) => boolean;
}

/**
 * Performs the registration-file writes the token pipe queues, and remembers the activity token
 * last written to each Host so a clear removes that token and nothing another Host wrote.
 */
export class RegistrationWriter {
  private readonly written = new Map<string, string>();

  constructor(
    private readonly o: CoordinatorOptions,
    private readonly lookups: WriterLookups,
  ) {}

  forget(hostId: string): void {
    this.written.delete(hostId);
  }

  clear(): void {
    this.written.clear();
  }

  hostIds(): string[] {
    return [...this.written.keys()];
  }

  /** True when the write landed. Never throws. */
  async perform(job: TokenJob, hostId: string): Promise<boolean> {
    const device = this.o.deviceToken();
    const host = this.lookups.host(hostId);
    if (!device || !host) return false;
    const pins = this.o.pinnedPaneIds?.(hostId) ?? [];
    const hostName = this.lookups.hostName(hostId);
    const written = this.written.get(hostId) ?? null;
    const { ceremony } = this.o;
    try {
      await this.o.transports.withTransport(host, async (transport) => {
        if (job.kind === 'set') {
          await ceremony.setLiveActivityToken({
            host,
            deviceToken: device,
            tokenHex: job.hex,
            startedAt: isoSeconds(job.startedAt),
            pinnedPaneIds: pins,
            hostName,
            transport,
          });
        } else if (job.kind === 'setPreferences') {
          await ceremony.setLiveActivityPinnedPaneIds(host, device, pins, transport);
        } else {
          await ceremony.clearLiveActivityToken(host, device, written, transport);
        }
      });
      // A write landing after its Host left the catalog records nothing.
      if (!this.lookups.isKnown(hostId)) return true;
      if (job.kind === 'set') this.written.set(hostId, job.hex);
      else if (job.kind === 'clear') this.written.delete(hostId);
      return true;
    } catch {
      // A failed set may still have landed: forget the token so a clear drops whatever is there.
      if (job.kind === 'set') this.written.delete(hostId);
      return false;
    }
  }
}
