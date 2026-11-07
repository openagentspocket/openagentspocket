import * as LocalAuthentication from 'expo-local-authentication';
import { type AuthResult, guardAuthenticator } from './authenticator';

const { AuthenticationType, SecurityLevel } = LocalAuthentication;

const CANCELLED = new Set(['user_cancel', 'user_fallback']);
const INTERRUPTED = new Set(['system_cancel', 'app_cancel']);
const UNAVAILABLE = new Set(['not_enrolled', 'passcode_not_set', 'not_available']);

async function prompt(reason: string): Promise<AuthResult> {
  const result = await LocalAuthentication.authenticateAsync({ promptMessage: reason });
  if (result.success) return 'success';
  if (CANCELLED.has(result.error)) return 'cancelled';
  if (INTERRUPTED.has(result.error)) return 'interrupted';
  if (UNAVAILABLE.has(result.error)) return 'unavailable';
  return 'denied';
}

/** expo-local-authentication, with the passcode as the fallback the OS offers. */
export const deviceAuthenticator = guardAuthenticator(async () => {
  if ((await LocalAuthentication.getEnrolledLevelAsync()) === SecurityLevel.NONE) return null;
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (types.includes(AuthenticationType.FACIAL_RECOGNITION)) return 'Face ID';
  if (types.includes(AuthenticationType.FINGERPRINT)) return 'Touch ID';
  return 'Passcode';
}, prompt);
