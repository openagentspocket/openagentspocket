/** How an owner check ended. */
export type AuthResult =
  /** The owner proved themselves. */
  | 'success'
  /** The prompt ran and the owner did not pass (or it threw). */
  | 'denied'
  /** The owner or the system dismissed the prompt; nothing to report. */
  | 'cancelled'
  /** The device cannot authenticate (no passcode or biometrics set up). */
  | 'unavailable';

/** The device-owner check behind the app lock (Face ID, Touch ID, or the passcode). */
export interface Authenticator {
  /** "Face ID", "Touch ID" or "Passcode"; null when the device cannot authenticate. */
  kind(): Promise<string | null>;
  /** Prompts; never throws. */
  authenticate(reason: string): Promise<AuthResult>;
  /**
   * True while this authenticator's own prompt is up. The OS sheet makes the app go inactive and
   * active again, which must neither cover nor relock the app (Swift's `isAuthenticating`).
   */
  isPrompting(): boolean;
}

/** Wraps a prompt function: tracks `isPrompting` and turns a throw into `denied`. */
export function guardAuthenticator(
  kind: () => Promise<string | null>,
  prompt: (reason: string) => Promise<AuthResult>,
): Authenticator {
  let prompting = 0;
  return {
    kind,
    isPrompting: () => prompting > 0,
    async authenticate(reason) {
      prompting += 1;
      try {
        return await prompt(reason);
      } catch {
        return 'denied';
      } finally {
        prompting -= 1;
      }
    },
  };
}

/** A scripted authenticator for tests and previews. `onPrompt` runs while the prompt is up. */
export function fakeAuthenticator(
  kind: string | null,
  succeeds = true,
  onPrompt?: () => void | Promise<void>,
): Authenticator {
  return guardAuthenticator(
    () => Promise.resolve(kind),
    async () => {
      await onPrompt?.();
      return succeeds ? 'success' : 'denied';
    },
  );
}
