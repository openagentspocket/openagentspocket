import * as LocalAuthentication from 'expo-local-authentication';
import type { Authenticator } from './authenticator';

const { AuthenticationType, SecurityLevel } = LocalAuthentication;

/** expo-local-authentication, with the passcode as the fallback the OS offers. */
export const deviceAuthenticator: Authenticator = {
  async kind() {
    if ((await LocalAuthentication.getEnrolledLevelAsync()) === SecurityLevel.NONE) return null;
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(AuthenticationType.FACIAL_RECOGNITION)) return 'Face ID';
    if (types.includes(AuthenticationType.FINGERPRINT)) return 'Touch ID';
    return 'Passcode';
  },
  async authenticate(reason) {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: reason });
    return result.success;
  },
};
