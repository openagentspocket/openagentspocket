/**
 * Why Notification Registration failed: a closed taxonomy so the UI can tell "install the plugin
 * on this Host" from "the write broke". Transport-level failures (unreachable Host, timeout,
 * cancellation) stay `TransportFailure`.
 */
export type NotificationRegistrationFailure =
  /** The Agentico plugin is not installed, or is disabled, on the Host. */
  | { readonly kind: 'pluginNotInstalled' }
  /** `herdr plugin list` / `config-dir` could not run or printed something unparseable. */
  | { readonly kind: 'pluginProbeFailed'; readonly detail: string }
  /** The registration file exists but could not be read. */
  | { readonly kind: 'readFailed'; readonly detail: string }
  /** The registration file could not be replaced atomically. */
  | { readonly kind: 'writeFailed'; readonly detail: string }
  /**
   * The Host's file declares a version this build does not write; clobbering it could destroy a
   * newer app's registrations, so the ceremony refuses.
   */
  | { readonly kind: 'unsupportedFileVersion'; readonly version: number }
  /** The Host has no entry for this device, so nothing can be attached to it (fail closed). */
  | { readonly kind: 'deviceNotRegistered' };

export class NotificationRegistrationError extends Error {
  override readonly name = 'NotificationRegistrationError';

  constructor(readonly failure: NotificationRegistrationFailure) {
    super(`NotificationRegistration.${failure.kind}`);
  }
}
