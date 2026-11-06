import Storage from 'expo-sqlite/kv-store';
import {
  type CrashStorage,
  type ErrorHooks,
  type ExceptionReporter,
  installCrashRecorder,
  installFatalReportRecorder,
} from './crashRecorder';

/** Where the last uncaught error is kept: the device key-value store. */
export const crashStorage: CrashStorage = Storage;

/** Called once at startup, before any screen renders. */
export function recordUncaughtErrors(): void {
  installCrashRecorder((globalThis as { ErrorUtils?: ErrorHooks }).ErrorUtils, crashStorage);
  // biome-ignore lint/suspicious/noReactNativeDeepImports: the only place a fatal error passes through
  const { default: reporter } = require('react-native/Libraries/Core/NativeExceptionsManager') as {
    default?: ExceptionReporter;
  };
  installFatalReportRecorder(reporter, crashStorage);
}
