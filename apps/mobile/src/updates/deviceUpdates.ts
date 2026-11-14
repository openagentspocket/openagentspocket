import { Platform } from 'react-native';
import { type AppUpdates, createAppUpdates, type UpdatesApi } from './appUpdates';

/**
 * The running app's updates, read once from `expo-updates`. Web never loads it (the web module
 * claims updates are enabled); a build without the native module, or with `updates.enabled: false`
 * (every build but an official store one, apps/mobile/app.config.js), gets updates off.
 */
function load(): UpdatesApi | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('expo-updates') as UpdatesApi;
  } catch {
    return null;
  }
}

export const deviceUpdates: AppUpdates = createAppUpdates(load());
