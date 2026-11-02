import {
  type ActivityHandle,
  ActivityRequestError,
  type ActivityRunState,
  type LiveActivityController,
  type Unsubscribe,
} from './controller';
import type { ActivityContentState } from './types';

interface Record {
  handle: ActivityHandle;
  content: ActivityContentState | null;
  lastToken?: string;
  tokenListeners: Set<(hex: string) => void>;
  stateListeners: Set<(state: ActivityRunState) => void>;
}

/** An ActivityKit stand-in: records request/update/end and lets a test push tokens and run states. */
export class FakeLiveActivityController implements LiveActivityController {
  areEnabled = true;
  requestError: Error | null = null;
  readonly requested: ActivityContentState[] = [];
  readonly requestedHandles: ActivityHandle[] = [];
  readonly updates: { id: string; content: ActivityContentState }[] = [];
  readonly ended: {
    id: string;
    finalContent: ActivityContentState | null;
    immediate: boolean;
  }[] = [];
  private nextId = 1;
  private readonly records = new Map<string, Record>();

  /** Subscriptions still open: a stop or a drop must bring this to zero. */
  get tokenSubscriberCount(): number {
    return [...this.records.values()].reduce((sum, r) => sum + r.tokenListeners.size, 0);
  }

  /** An activity that survived a previous launch. */
  seed(id: string, hostId: string, content: ActivityContentState | null = null): void {
    this.records.set(id, {
      handle: { id, hostId },
      content,
      tokenListeners: new Set(),
      stateListeners: new Set(),
    });
  }

  emitToken(id: string, hex: string): void {
    const record = this.records.get(id);
    if (!record) return;
    record.lastToken = hex;
    for (const listener of [...record.tokenListeners]) listener(hex);
  }

  emitState(id: string, state: ActivityRunState): void {
    for (const listener of [...(this.records.get(id)?.stateListeners ?? [])]) listener(state);
  }

  /** Rewrites what the activity shows, as the approval intents' handler does. */
  setContent(id: string, content: ActivityContentState): void {
    const record = this.records.get(id);
    if (record) record.content = content;
  }

  activityId(hostId: string): string | undefined {
    return [...this.records.values()].find((r) => r.handle.hostId === hostId)?.handle.id;
  }

  async request(hostId: string, content: ActivityContentState): Promise<ActivityHandle> {
    if (this.requestError) throw this.requestError;
    if (!this.areEnabled) throw new ActivityRequestError('disabled');
    const handle = { id: `act-${this.nextId++}`, hostId };
    this.requested.push(content);
    this.requestedHandles.push(handle);
    this.records.set(handle.id, {
      handle,
      content,
      tokenListeners: new Set(),
      stateListeners: new Set(),
    });
    return handle;
  }

  update(id: string, content: ActivityContentState): void {
    this.updates.push({ id, content });
    const record = this.records.get(id);
    if (record) record.content = content;
  }

  end(id: string, finalContent: ActivityContentState | null, immediate: boolean): void {
    this.ended.push({ id, finalContent, immediate });
    this.records.delete(id);
  }

  async currentActivities(): Promise<readonly ActivityHandle[]> {
    return [...this.records.values()].map((r) => r.handle);
  }

  async currentContent(id: string): Promise<ActivityContentState | null> {
    return this.records.get(id)?.content ?? null;
  }

  onPushToken(handle: ActivityHandle, listener: (hex: string) => void): Unsubscribe {
    const record = this.records.get(handle.id);
    if (!record) return () => undefined;
    record.tokenListeners.add(listener);
    if (record.lastToken !== undefined) listener(record.lastToken);
    return () => record.tokenListeners.delete(listener);
  }

  onState(handle: ActivityHandle, listener: (state: ActivityRunState) => void): Unsubscribe {
    const record = this.records.get(handle.id);
    if (!record) return () => undefined;
    record.stateListeners.add(listener);
    return () => record.stateListeners.delete(listener);
  }
}
