import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export type HapticWeight = 'light' | 'medium';

let enabled = true;

/** Mirrors the user's Haptics preference; `impact` is a no-op while it is off. */
export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

export function hapticsEnabled(): boolean {
  return enabled;
}

/**
 * The Swift app's only two feedbacks: light impact (terminal toolbar, keys, D-pad, jump) and
 * medium impact (edge dock lift, timeline pin). Lists, sheets and menus get the platform's own.
 * No-op on web and when the preference is off. Needs the native module (expo-haptics): the
 * integrator rebuilds native once after it was installed.
 */
export function impact(weight: HapticWeight = 'light'): void {
  if (!enabled || Platform.OS === 'web') return;
  const style =
    weight === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light;
  Haptics.impactAsync(style).catch(() => {});
}
