import type { KeyValueStorage } from '../hosts/known-hosts';

export const LIVE_ACTIVITY_PREFERENCES_KEY = 'live-activity.enabled-hosts';

/** Per-Host Live Activity opt-in. A Host with no entry reads as off: fail closed. */
export class LiveActivityPreferences {
  private enabled: Set<string>;

  constructor(private readonly storage: KeyValueStorage) {
    this.enabled = new Set(decode(storage.getString(LIVE_ACTIVITY_PREFERENCES_KEY)));
  }

  isEnabled(hostId: string): boolean {
    return this.enabled.has(hostId);
  }

  setEnabled(enabled: boolean, hostId: string): void {
    if (enabled) this.enabled.add(hostId);
    else this.enabled.delete(hostId);
    this.storage.set(LIVE_ACTIVITY_PREFERENCES_KEY, JSON.stringify([...this.enabled].sort()));
  }
}

function decode(text: string | undefined): string[] {
  if (text === undefined) return [];
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
