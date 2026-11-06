import type { ComponentProps } from 'react';
import { Platform, Pressable, type ViewStyle } from 'react-native';

/** The browser's focus outline, which no pressable control here draws. */
export const noFocusRing = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as ViewStyle;

export type TappableProps = ComponentProps<typeof Pressable>;

/**
 * The one touch surface every control starts from: `Button`, rows, cards and backdrops. What all of
 * them should do on a press goes here, once. Nothing else imports Pressable
 * (`scripts/check-raw-pressable.mjs`).
 */
export function Tappable({ style, ...props }: TappableProps) {
  return (
    <Pressable
      style={
        typeof style === 'function' ? (state) => [noFocusRing, style(state)] : [noFocusRing, style]
      }
      {...props}
    />
  );
}
