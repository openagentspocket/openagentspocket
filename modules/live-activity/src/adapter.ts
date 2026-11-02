import {
  type ActivityContentState,
  type ActivityHandle,
  ActivityRequestError,
  type ActivityRunState,
  type LiveActivityController,
  type Unsubscribe,
} from '@openagentspocket/core';

/** The native module's surface (see ios/AgenticoLiveActivityModule.swift). */
export interface NativeLiveActivity {
  areActivitiesEnabled(): boolean;
  request(hostId: string, contentJson: string): Promise<string>;
  update(id: string, contentJson: string): Promise<void>;
  end(id: string, finalContentJson: string | null, immediate: boolean): Promise<void>;
  currentActivities(): Promise<{ id: string; hostId: string }[]>;
  currentContent(id: string): Promise<string | null>;
  observe(id: string): void;
  unobserve(id: string): void;
  addListener(
    event: 'onPushToken',
    listener: (e: { id: string; token: string }) => void,
  ): Removable;
  addListener(
    event: 'onStateChange',
    listener: (e: { id: string; state: string }) => void,
  ): Removable;
}

export interface Removable {
  remove(): void;
}

const RUN_STATES: readonly ActivityRunState[] = ['active', 'stale', 'ended', 'dismissed'];

function parseContent(json: string | null): ActivityContentState | null {
  if (json === null) return null;
  try {
    const value = JSON.parse(json) as ActivityContentState;
    return typeof value?.counts === 'object' ? value : null;
  } catch {
    return null;
  }
}

interface Watch {
  lastToken?: string;
  readonly tokens: Set<(hex: string) => void>;
  readonly states: Set<(state: ActivityRunState) => void>;
}

/**
 * Adapts the ActivityKit module to core's `LiveActivityController`. One native subscription per
 * event; per-activity fan-out and a cached last token (so a later subscriber still sees it) live
 * here. `areEnabled` is read from the OS on every call: it is a cheap synchronous query.
 */
export function createLiveActivityController(native: NativeLiveActivity): LiveActivityController {
  const watches = new Map<string, Watch>();
  const watch = (id: string): Watch => {
    let entry = watches.get(id);
    if (!entry) {
      entry = { tokens: new Set(), states: new Set() };
      watches.set(id, entry);
      native.observe(id);
    }
    return entry;
  };
  const release = (id: string) => {
    const entry = watches.get(id);
    if (!entry || entry.tokens.size > 0 || entry.states.size > 0) return;
    watches.delete(id);
    native.unobserve(id);
  };

  native.addListener('onPushToken', ({ id, token }) => {
    const entry = watches.get(id);
    if (!entry) return;
    entry.lastToken = token;
    for (const listener of [...entry.tokens]) listener(token);
  });
  native.addListener('onStateChange', ({ id, state }) => {
    const known = RUN_STATES.find((s) => s === state);
    if (!known) return;
    for (const listener of [...(watches.get(id)?.states ?? [])]) listener(known);
  });

  return {
    get areEnabled() {
      return native.areActivitiesEnabled();
    },
    async request(hostId, content) {
      try {
        const id = await native.request(hostId, JSON.stringify(content));
        return { id, hostId };
      } catch (thrown) {
        throw new ActivityRequestError(thrown instanceof Error ? thrown.message : String(thrown));
      }
    },
    update(id, content) {
      void native.update(id, JSON.stringify(content)).catch(() => undefined);
    },
    end(id, finalContent, immediate) {
      const json = finalContent ? JSON.stringify(finalContent) : null;
      void native
        .end(id, json, immediate)
        .catch(() => undefined)
        .finally(() => {
          watches.delete(id);
          native.unobserve(id);
        });
    },
    currentActivities: () => native.currentActivities(),
    async currentContent(id) {
      return parseContent(await native.currentContent(id));
    },
    onPushToken(handle: ActivityHandle, listener): Unsubscribe {
      const entry = watch(handle.id);
      entry.tokens.add(listener);
      if (entry.lastToken !== undefined) listener(entry.lastToken);
      return () => {
        entry.tokens.delete(listener);
        release(handle.id);
      };
    },
    onState(handle: ActivityHandle, listener): Unsubscribe {
      const entry = watch(handle.id);
      entry.states.add(listener);
      return () => {
        entry.states.delete(listener);
        release(handle.id);
      };
    },
  };
}

/** Where Live Activities do not exist (Android, web): nothing starts and nothing is enabled. */
export const unavailableLiveActivities: LiveActivityController = {
  areEnabled: false,
  request: async () => {
    throw new ActivityRequestError('Live Activities are not available on this platform.');
  },
  update: () => undefined,
  end: () => undefined,
  currentActivities: async () => [],
  currentContent: async () => null,
  onPushToken: () => () => undefined,
  onState: () => () => undefined,
};
