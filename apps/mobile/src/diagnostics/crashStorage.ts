import Storage from 'expo-sqlite/kv-store';
import { type CrashStorage, type ErrorHooks, installCrashRecorder } from './crashRecorder';

/** Where the last uncaught error is kept: the device key-value store. */
export const crashStorage: CrashStorage = Storage;

/** Called once at startup, before any screen renders. */
export function recordUncaughtErrors(): void {
  installCrashRecorder((globalThis as { ErrorUtils?: ErrorHooks }).ErrorUtils, crashStorage);
}
