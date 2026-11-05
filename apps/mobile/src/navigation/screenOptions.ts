import { mixed, type Theme } from '@openagentspocket/ui';
import type { NativeStackNavigationOptions } from 'expo-router';

/**
 * The one native header look, for every Stack on iOS and Android: an opaque bar in the canvas
 * color (content starts below it, never under it), title in primary ink, back button in the
 * accent, no hairline shadow. Built from tokens only; screens never restyle their header.
 */
export function stackScreenOptions({
  colors,
  metrics,
}: Pick<Theme, 'colors' | 'metrics'>): NativeStackNavigationOptions {
  return {
    headerShown: true,
    headerTransparent: false,
    headerBlurEffect: 'none',
    headerShadowVisible: false,
    // The screen under it washes the canvas with the theme's glow at the top; a bar in the plain
    // canvas would read as a black band, so it takes the glow's average tone.
    headerStyle: { backgroundColor: mixed(colors.canvas, colors.glow, metrics.glowOpacity * 0.75) },
    // Every stack's back button is the chevron alone, like the sheet bar's, never "< Title".
    headerBackButtonDisplayMode: 'minimal',
    headerTitleStyle: { color: colors.textPrimary },
    headerTintColor: colors.accent,
    contentStyle: { backgroundColor: colors.canvas },
  };
}

/** The status bar ink that reads on the theme's canvas: light ink on dark themes, dark on Papel. */
export function statusBarStyle(appearance: Theme['appearance']): 'light' | 'dark' {
  return appearance === 'dark' ? 'light' : 'dark';
}
