import type { RandomBytes } from '@openagentspocket/core';
import { getRandomBytes } from 'expo-crypto';

/** Cryptographically secure bytes from the OS (SecRandomCopyBytes / SecureRandom), for keys and nonces. */
export const secureRandomBytes: RandomBytes = (length) => getRandomBytes(length);
