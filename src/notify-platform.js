// Which push service a Notification Registration entry targets (additive v1).
//
// `platform` is optional: absent (every entry older apps wrote) or "ios"
// means APNs, with `env` naming the APNs environment; "android" means FCM,
// with `env` fixed to "fcm". Plugins before 0.12.0 accept only the APNs
// environments, so they skip Android entries instead of sending an FCM token
// down the APNs path. Anything else is a platform this plugin does not know:
// skipped, never guessed.

export const APNS_ENVIRONMENTS = new Set(["production", "sandbox"]);
const ENVIRONMENTS_BY_PLATFORM = { ios: APNS_ENVIRONMENTS, android: new Set(["fcm"]) };

/** The entry's platform: `ios` when absent or null, else the value as written. */
export function platformOf(entry) {
  return entry?.platform ?? "ios";
}

/**
 * The push target of a registration entry, or null when this plugin cannot
 * deliver to it (unknown platform, or an env that does not belong to it).
 *
 * @returns {{platform: "ios" | "android", env: string} | null}
 */
export function pushTarget(entry) {
  const platform = platformOf(entry);
  if (!Object.hasOwn(ENVIRONMENTS_BY_PLATFORM, platform)) return null;
  if (!ENVIRONMENTS_BY_PLATFORM[platform].has(entry.env)) return null;
  return { platform, env: entry.env };
}

/**
 * The relay `/push` body for an alert. iOS bodies carry no `platform`, so
 * they stay byte-identical to what earlier plugins sent (and any relay
 * accepts them); Android bodies name their platform.
 *
 * @param {{token: string, platform: "ios" | "android", env: string}} device
 * @param {string} envelope
 * @param {string | undefined} collapse
 */
export function alertPushBody(device, envelope, collapse) {
  const body = { token: device.token, env: device.env, envelope, collapse };
  return JSON.stringify(device.platform === "android" ? { platform: "android", ...body } : body);
}
