import type { Theme } from '@openagentspocket/ui';
import type { NativeStackNavigationOptions } from 'expo-router';
import { Platform } from 'react-native';

/**
 * Where a route sheet rests, as shares of the screen height, ascending: `[0.7, 1]` opens at 70% and
 * drags up to full; `'fit'` is as tall as the content (needs content that has its own height).
 */
export type SheetDetents = readonly number[] | 'fit';

/**
 * The one way a route is presented as a sheet: iOS's native form sheet (rounded, grabber, detents,
 * system material) with the radius from the sheet token. Android and web keep the full-screen modal:
 * the Android bottom sheet cannot host the nested Stacks some of these routes own, and web has no
 * native sheet. Presentation is static, so call this in the root stack only (see modalRoutes.test).
 */
export function sheetOptions(
  { metrics }: Pick<Theme, 'metrics'>,
  { detents = [1] }: { detents?: SheetDetents } = {},
): NativeStackNavigationOptions {
  if (Platform.OS !== 'ios') return { presentation: 'modal' };
  return {
    presentation: 'formSheet',
    sheetAllowedDetents: detents === 'fit' ? 'fitToContents' : [...detents],
    sheetCornerRadius: metrics.sheetRadius,
    sheetGrabberVisible: true,
    sheetExpandsWhenScrolledToEdge: true,
  };
}
