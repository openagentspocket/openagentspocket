import type { EventsSessionStatus } from '../events/types';
import type { Clock } from '../hosts/cancellation';
import type { Host } from '../hosts/host';
import type { NotificationRegistrationCeremony } from '../notifications/ceremony';
import type { NotificationKeyStore, RandomBytes } from '../notifications/key-store';
import type { NotificationTransportProvider } from '../notifications/preferences-store';
import type { PushDeviceToken } from '../notifications/push-token';
import type { LiveActivityController } from './controller';
import type { LiveActivityPreferences } from './preferences';
import type { ActivityAsk } from './types';

export const SETTLE_MS = 3000;

/** The last reconcile verdict per Host; the Settings diagnostic row maps it to words. */
export type ReconcileNote =
  | { readonly kind: 'started' }
  | { readonly kind: 'updated' }
  | { readonly kind: 'sealFailed' }
  | { readonly kind: 'startFailed'; readonly reason: string }
  | {
      readonly kind: 'idle';
      readonly reason:
        | 'activitiesDisabled'
        | 'hostToggleOff'
        | 'noDeviceToken'
        | 'noNotificationKey'
        | 'noAgents';
    };

export interface CoordinatorOptions {
  readonly controller: LiveActivityController;
  readonly preferences: LiveActivityPreferences;
  readonly transports: NotificationTransportProvider;
  readonly keys: NotificationKeyStore;
  readonly ceremony: NotificationRegistrationCeremony;
  readonly clock: Clock;
  readonly randomBytes: RandomBytes;
  readonly deviceToken: () => PushDeviceToken | null;
  /** The Host catalog; a Host outside it never gets an activity or a registration write. */
  readonly hosts: () => readonly Host[];
  /** True while the Host's Agent list is unknown (first connect, or a reconnect before its snapshot). */
  readonly isAwaitingSnapshot: (hostId: string) => boolean;
  readonly connectionStatus: (hostId: string) => EventsSessionStatus | undefined;
  /** Most recently pinned first. */
  readonly pinnedPaneIds?: (hostId: string) => readonly string[];
  /** The prompts this device may answer from the Host's activity, by pane id. */
  readonly approvalAsks?: (hostId: string) => ReadonlyMap<string, ActivityAsk>;
  /** Whether an Approve/Deny action of this process is still running (keeps "sending"). */
  readonly isActionInFlight?: (hostId: string, paneId: string, episodeId: string) => boolean;
  readonly settleMs?: number;
  /** Epoch milliseconds. */
  readonly now?: () => number;
  readonly onChange?: () => void;
}

export interface Session {
  readonly id: string;
  awaitingFirstSnapshot: boolean;
  unsubscribe: () => void;
}
