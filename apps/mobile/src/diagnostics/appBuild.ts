import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { AppBuild } from './problemReport';

/**
 * The running app's version, build and system: Settings shows the version, a problem report sends
 * all three. The build is the binary's own (`CFBundleVersion` on iOS), the config's as a fallback.
 */
export function appBuild(): AppBuild {
  const build =
    Constants.platform?.ios?.buildNumber ??
    Constants.expoConfig?.ios?.buildNumber ??
    String(Constants.platform?.android?.versionCode ?? '');
  return {
    version: Constants.expoConfig?.version ?? '',
    build,
    system: `${Platform.OS} ${Platform.Version}`,
  };
}
