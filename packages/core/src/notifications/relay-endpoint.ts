/**
 * The default Push Relay: the hosted one the project runs. A Custom Push Relay replaces it. The
 * plugin carries the same value as its runtime default; `default-relay-v1.json` pins both.
 */
export const DEFAULT_RELAY_BASE_URL = 'https://relay.openagentspocket.com';

/**
 * The default before the hosted relay, which apps wrote into every Host's `notify.json` and nothing
 * served on a normal Host. A Host still naming it gets the relay this device resolves on its next
 * load. The plugin honours it as written: it is also what a self-hosted relay on the Host uses.
 */
export const RETIRED_DEFAULT_RELAY_BASE_URLS: readonly string[] = ['http://127.0.0.1:8787'];

/** The relay a registration writes into `notify.json`: the custom URL, else the default. */
export function resolveRelayBaseURL(customBaseURL: string | null): string {
  return customBaseURL ?? DEFAULT_RELAY_BASE_URL;
}

export type RelayURLCheck =
  | { readonly kind: 'empty' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'valid'; readonly url: string; readonly isInsecureHTTP: boolean };

/**
 * Reads the Custom Push Relay field: blank means no override, anything else must be an
 * http(s) URL with a host. HTTP is accepted but flagged (it exposes the token and metadata).
 */
export function checkRelayInput(raw: string): RelayURLCheck {
  const text = raw.trim();
  if (text === '') return { kind: 'empty' };
  const match = /^(https?):\/\/([^\s/?#]+)([^\s]*)$/i.exec(text);
  if (!match?.[2] || /[@]/.test(match[2])) return { kind: 'invalid' };
  return {
    kind: 'valid',
    url: text.replace(/\/+$/, ''),
    isInsecureHTTP: (match[1] ?? '').toLowerCase() === 'http',
  };
}
