/** The slice of the resolved Expo config (`Constants.expoConfig`) the APNs environment is read from. */
export interface ApnsConfig {
  readonly ios?: { readonly entitlements?: Readonly<Record<string, unknown>> };
}

/**
 * Whether the device's APNs token belongs to the sandbox. The one source of truth is the
 * `aps-environment` entitlement the app is signed with (`ios.entitlements` of the resolved config),
 * never the JS bundle mode: a Release build signed with a development profile still gets a sandbox
 * token. `fallback` (the dev flag) only applies when the config does not carry the entitlement.
 */
export function isApnsSandbox(config: ApnsConfig | null | undefined, fallback: boolean): boolean {
  const environment = config?.ios?.entitlements?.['aps-environment'];
  if (environment === 'development') return true;
  if (environment === 'production') return false;
  return fallback;
}
