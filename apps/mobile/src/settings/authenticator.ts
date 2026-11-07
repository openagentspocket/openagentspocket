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
  /**
   * Prompts; never throws. One prompt at a time: a second one would cancel the first. With
   * `reuseWithinMs`, a success that recent answers without asking, so App Lock's own unlock also
   * covers the SSH keys it wakes up.
   */
  authenticate(reason: string, options?: { reuseWithinMs?: number }): Promise<AuthResult>;
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
  now: () => number = Date.now,
): Authenticator {
  let prompting = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let succeededAt: number | undefined;
  const ask = async (reason: string, reuseWithinMs: number | undefined): Promise<AuthResult> => {
    if (reuseWithinMs !== undefined && succeededAt !== undefined) {
      if (now() - succeededAt < reuseWithinMs) return 'success';
    }
    try {
      const result = await prompt(reason);
      if (result === 'success') succeededAt = now();
      return result;
    } catch {
      return 'denied';
    }
  };
  return {
    kind,
    isPrompting: () => prompting > 0,
    authenticate(reason, options) {
      prompting += 1;
      const run = queue.then(() => ask(reason, options?.reuseWithinMs));
      queue = run;
      return run.finally(() => {
        prompting -= 1;
      });
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
