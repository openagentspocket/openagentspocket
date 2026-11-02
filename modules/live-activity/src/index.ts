import { requireNativeModule } from 'expo';
import { Platform } from 'react-native';
import {
  createLiveActivityController,
  type NativeLiveActivity,
  unavailableLiveActivities,
} from './adapter';

export {
  createLiveActivityController,
  type NativeLiveActivity,
  unavailableLiveActivities,
} from './adapter';

let controller: ReturnType<typeof createLiveActivityController> | undefined;

/** Loaded on first use so importing this package never requires the native module. */
export function liveActivityController() {
  controller ??=
    Platform.OS === 'ios'
      ? createLiveActivityController(
          requireNativeModule<NativeLiveActivity>('AgenticoLiveActivity'),
        )
      : unavailableLiveActivities;
  return controller;
}
