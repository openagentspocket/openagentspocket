import { runningUpdateReportText, summarizeRunningUpdate } from '@openagentspocket/core';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { AppUpdates } from '@/updates/appUpdates';
import { deviceUpdates } from '@/updates/deviceUpdates';
import type { AppBuild } from './problemReport';

/**
 * The running app's version, build, system and, in a build with over-the-air updates, the update it
 * runs: Settings shows the version, a problem report sends them all. The build is the binary's own
 * (`CFBundleVersion` on iOS), the config's as a fallback.
 */
export function appBuild(updates: AppUpdates = deviceUpdates): AppBuild {
  const build =
    Constants.platform?.ios?.buildNumber ??
    Constants.expoConfig?.ios?.buildNumber ??
    String(Constants.platform?.android?.versionCode ?? '');
  return {
    version: Constants.expoConfig?.version ?? '',
    build,
    system: `${Platform.OS} ${Platform.Version}`,
    ...(updates.enabled
      ? { update: runningUpdateReportText(summarizeRunningUpdate(updates.running())) }
      : {}),
  };
}
