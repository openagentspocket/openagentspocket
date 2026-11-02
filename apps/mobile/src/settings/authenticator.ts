/** The device-owner check behind the app lock (Face ID, Touch ID, or the passcode). */
export interface Authenticator {
  /** "Face ID", "Touch ID" or "Passcode"; null when the device cannot authenticate. */
  kind(): Promise<string | null>;
  /** Prompts; true when the owner proved themselves. */
  authenticate(reason: string): Promise<boolean>;
}

/** A scripted authenticator for tests and previews. */
export function fakeAuthenticator(kind: string | null, succeeds = true): Authenticator {
  return {
    kind: () => Promise.resolve(kind),
    authenticate: () => Promise.resolve(succeeds),
  };
}
