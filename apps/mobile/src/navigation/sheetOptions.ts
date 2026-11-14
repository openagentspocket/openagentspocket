import type { Theme } from '@openagentspocket/ui';
import type { NativeStackNavigationOptions } from 'expo-router';
import { Platform } from 'react-native';

/**
 * How tall a route sheet opens. `full` (the default): a sheet whose content scrolls or pushes
 * further screens opens at full height and never at a guessed fraction. `fit`: as tall as its
 * content, for a short sheet whose content has its own height (no `flex: 1` inside).
 */
export type SheetSize = 'full' | 'fit';

/**
 * The one way a route is presented as a sheet: iOS's native form sheet (rounded, grabber, system
 * behavior) with the radius from the sheet token and the app's own opaque surface, so it matches
 * the JS `Sheet`. Android and web keep the full-screen modal: the Android bottom sheet cannot host
 * the nested Stacks some of these routes own, and web has no native sheet. Presentation is static,
 * so call this in the root stack only (see modalRoutes.test).
 */
export function sheetOptions(
  { radius }: Pick<Theme, 'radius'>,
  { size = 'full' }: { size?: SheetSize } = {},
): NativeStackNavigationOptions {
  if (Platform.OS !== 'ios') return { presentation: 'modal' };
  return {
    presentation: 'formSheet',
    sheetAllowedDetents: size === 'fit' ? 'fitToContents' : [1],
    sheetCornerRadius: radius.sheet,
    sheetGrabberVisible: true,
    sheetExpandsWhenScrolledToEdge: true,
  };
}
