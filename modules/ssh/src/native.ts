import { requireNativeModule } from 'expo';
import type { NativeSshBridge } from './bridge';
import { createSshClient } from './client';
import type { SshModule } from './types';

let client: SshModule | undefined;

/**
 * The SSH module backed by native code (iOS: libssh2 + OpenSSL). Loaded on first use, so
 * importing this package never requires the native module (tests, web, Demo mode).
 */
export function nativeSsh(): SshModule {
  client ??= createSshClient(requireNativeModule<NativeSshBridge>('AgenticoSSH'));
  return client;
}
