import type { ActivityContentState } from './types';

/** A started (or adopted) activity, identified as ActivityKit does plus the Host it was requested for. */
export interface ActivityHandle {
  readonly id: string;
  readonly hostId: string;
}

/** ActivityKit's `ActivityState`, reduced to what the coordinator observes. */
export type ActivityRunState = 'active' | 'stale' | 'ended' | 'dismissed';

export type Unsubscribe = () => void;

/** Thrown by `request` when ActivityKit refuses; carries its own reason for the diagnostic row. */
export class ActivityRequestError extends Error {
  override readonly name = 'ActivityRequestError';
  constructor(readonly reason: string) {
    super(reason);
  }
}

/**
 * The native side of Live Activities, as the coordinator sees it. The Expo module adapts
 * ActivityKit to this port (modules/live-activity); tests use `FakeLiveActivityController`.
 * `update` and `end` are fire-and-forget: ActivityKit stays the source of truth.
 */
export interface LiveActivityController {
  /** Whether the user allows Live Activities; refreshed by the adapter, read synchronously. */
  readonly areEnabled: boolean;
  request(hostId: string, content: ActivityContentState): Promise<ActivityHandle>;
  update(id: string, content: ActivityContentState): void;
  end(id: string, finalContent: ActivityContentState | null, immediate: boolean): void;
  currentActivities(): Promise<readonly ActivityHandle[]>;
  /** What the activity shows now, including what other writers put there; null when gone. */
  currentContent(id: string): Promise<ActivityContentState | null>;
  /** Hex push tokens; the current token is delivered first, then every rotation. */
  onPushToken(handle: ActivityHandle, listener: (tokenHex: string) => void): Unsubscribe;
  onState(handle: ActivityHandle, listener: (state: ActivityRunState) => void): Unsubscribe;
}
