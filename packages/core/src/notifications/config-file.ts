import { utf8Decode, utf8Encode } from '../pairing/bytes';
import { isJsonObject, type JsonObject } from '../wire/json';
import { encodeSortedJson, jsonEqual } from './json';

export const RELAY_URL_KEY = 'relay_url';

/**
 * The plugin-side `notify.json` (`plugin/README.md`). The app owns one field, `relay_url`; the
 * plugin owns others (`debounce_ms`, `retry_delay_ms`) and future revisions may add more, so
 * every field the app does not understand survives a rewrite. No version gate: the plugin parses
 * this flat bag leniently. Immutable.
 */
export class NotificationConfigFile {
  constructor(private readonly fields: JsonObject = {}) {}

  /** Absent, corrupt or non-object content decodes as empty, as the plugin reads it. */
  static decode(data: Uint8Array | null): NotificationConfigFile {
    if (data === null) return new NotificationConfigFile();
    const text = utf8Decode(data, true);
    if (text === null) return new NotificationConfigFile();
    try {
      const value: unknown = JSON.parse(text);
      return isJsonObject(value as JsonObject)
        ? new NotificationConfigFile(value as JsonObject)
        : new NotificationConfigFile();
    } catch {
      return new NotificationConfigFile();
    }
  }

  /** The current `relay_url`, trailing slash trimmed as the plugin does; null when unset. */
  get relayURL(): string | null {
    const value = this.fields[RELAY_URL_KEY];
    return typeof value === 'string' ? normalizeURL(value) : null;
  }

  /** Sets `relay_url` (trailing slash trimmed) and touches no other field. */
  settingRelayURL(url: string): NotificationConfigFile {
    return new NotificationConfigFile({
      ...this.fields,
      [RELAY_URL_KEY]: normalizeURL(url) ?? url,
    });
  }

  equals(other: NotificationConfigFile): boolean {
    return jsonEqual(this.fields, other.fields);
  }

  encoded(): Uint8Array {
    return utf8Encode(encodeSortedJson(this.fields));
  }
}

function normalizeURL(url: string): string | null {
  let trimmed = url.trim();
  while (trimmed.endsWith('/')) trimmed = trimmed.slice(0, -1);
  return trimmed === '' ? null : trimmed;
}
