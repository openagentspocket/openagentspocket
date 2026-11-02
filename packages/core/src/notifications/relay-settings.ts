import type { KeyValueStorage } from '../hosts/known-hosts';
import { checkRelayInput, type RelayURLCheck } from './relay-endpoint';

export const RELAY_SETTING_KEY = 'notificationRelayURL';

/**
 * The app-side Custom Push Relay base URL. It points every Host's plugin at another relay
 * instead of the default one; blank (the default) leaves every Host's plugin config alone.
 * Persists the raw text the user typed, so an invalid entry is still there to fix.
 */
export class NotificationRelaySettings {
  private listeners = new Set<() => void>();

  constructor(private readonly storage: KeyValueStorage) {}

  get rawValue(): string {
    return this.storage.getString(RELAY_SETTING_KEY) ?? '';
  }

  set rawValue(value: string) {
    this.storage.set(RELAY_SETTING_KEY, value);
    for (const listener of [...this.listeners]) listener();
  }

  get check(): RelayURLCheck {
    return checkRelayInput(this.rawValue);
  }

  /** The URL registrations write, or null for the default relay (blank or invalid). */
  get customBaseURL(): string | null {
    const check = this.check;
    return check.kind === 'valid' ? check.url : null;
  }

  get hasInvalidEntry(): boolean {
    return this.check.kind === 'invalid';
  }

  get hasInsecureHTTPEntry(): boolean {
    const check = this.check;
    return check.kind === 'valid' && check.isInsecureHTTP;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}
