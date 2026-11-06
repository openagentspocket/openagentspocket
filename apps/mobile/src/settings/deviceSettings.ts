import { SettingsStore } from '@openagentspocket/core';
import { deviceStorage } from './deviceStorage';

/** The one settings store of the running app. */
export const settingsStore = new SettingsStore(deviceStorage);
