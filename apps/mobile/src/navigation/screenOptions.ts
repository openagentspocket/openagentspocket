import type { Theme } from '@openagentspocket/ui';
import type { NativeStackNavigationOptions } from 'expo-router';

/**
 * The one native header look, for every Stack on iOS and Android: an opaque bar in the canvas
 * color (content starts below it, never under it), title in primary ink, back button in the
 * accent, no hairline shadow. Built from tokens only; screens never restyle their header.
 */
export function stackScreenOptions({
  colors,
}: Pick<Theme, 'colors'>): NativeStackNavigationOptions {
  return {
    headerShown: true,
    headerTransparent: false,
    headerBlurEffect: 'none',
    headerShadowVisible: false,
    headerStyle: { backgroundColor: colors.canvas },
    headerTitleStyle: { color: colors.textPrimary },
    headerTintColor: colors.accent,
    contentStyle: { backgroundColor: colors.canvas },
  };
}

/** The status bar ink that reads on the theme's canvas: light ink on dark themes, dark on Papel. */
export function statusBarStyle(appearance: Theme['appearance']): 'light' | 'dark' {
  return appearance === 'dark' ? 'light' : 'dark';
}
