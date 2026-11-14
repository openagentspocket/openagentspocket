import type { ComponentProps } from 'react';
import { Platform, Pressable, type ViewStyle } from 'react-native';
import { continuousCurve } from '../theme/corners';

/** The browser's focus outline, which no pressable control here draws. */
export const noFocusRing = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as ViewStyle;

/** What every touch surface starts from: no focus ring, and iOS continuous corners for any radius. */
const base: ViewStyle[] = [noFocusRing, continuousCurve];

export type TappableProps = ComponentProps<typeof Pressable>;

/**
 * The one touch surface every control starts from: `Button`, rows, cards and backdrops. What all of
 * them should do on a press goes here, once. Nothing else imports Pressable
 * (`scripts/check-raw-pressable.mjs`).
 */
export function Tappable({ style, ...props }: TappableProps) {
  return (
    <Pressable
      style={typeof style === 'function' ? (state) => [base, style(state)] : [base, style]}
      {...props}
    />
  );
}
