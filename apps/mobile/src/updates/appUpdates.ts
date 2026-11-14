import {
  channelParamValue,
  type RunningUpdate,
  UPDATE_CHANNEL_PARAM,
  type UpdateChannel,
} from '@openagentspocket/core';

/**
 * Over-the-air updates as the app uses them (docs/guides/updates.md): whether this build has them,
 * what runs, and the channel. Updates download at launch and apply on the next cold start, which
 * expo-updates does by itself (`ON_LOAD`, timeout 0): nothing here checks, fetches or reloads.
 */
export interface AppUpdates {
  /** False in a build from source, a development build, on web and in tests. */
  readonly enabled: boolean;
  running(): RunningUpdate;
  /** Sent with the next update request (the next launch). Never throws. */
  setChannel(channel: UpdateChannel): Promise<void>;
}

/** The slice of `expo-updates` this uses; tests pass a fake. */
export interface UpdatesApi {
  readonly isEnabled: boolean;
  readonly isEmbeddedLaunch: boolean;
  readonly updateId: string | null;
  readonly createdAt: Date | null;
  setExtraParamAsync(key: string, value: string | null): Promise<void>;
}

const EMBEDDED: RunningUpdate = { embedded: true, id: null, createdAt: null };

/** A build without updates: Settings shows nothing about them and no request carries a channel. */
export const disabledUpdates: AppUpdates = {
  enabled: false,
  running: () => EMBEDDED,
  setChannel: async () => {},
};

export function createAppUpdates(api: UpdatesApi | null): AppUpdates {
  if (!api?.isEnabled) return disabledUpdates;
  return {
    enabled: true,
    running: () => ({
      embedded: api.isEmbeddedLaunch,
      id: api.updateId,
      createdAt: api.createdAt,
    }),
    async setChannel(channel) {
      // A failure keeps the previous channel; the next launch or toggle tries again. Nothing is
      // logged about updates.
      await api
        .setExtraParamAsync(UPDATE_CHANNEL_PARAM, channelParamValue(channel))
        .catch(() => undefined);
    },
  };
}

/** Test support: an updates-enabled build whose channel calls are recorded. */
export function fakeUpdatesApi(over: Partial<UpdatesApi> = {}): UpdatesApi & {
  params: Map<string, string>;
} {
  const params = new Map<string, string>();
  return {
    isEnabled: true,
    isEmbeddedLaunch: true,
    updateId: null,
    createdAt: null,
    params,
    async setExtraParamAsync(key, value) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    },
    ...over,
  };
}
