import type { Theme } from '@openagentspocket/ui';
import type { NativeStackNavigationOptions } from 'expo-router';

/**
 * The one native header look, for every Stack on iOS and Android: a transparent bar over the
 * screen's own background (content starts below it), title in primary ink, back button in the
 * accent, no hairline shadow. Built from tokens only; screens never restyle their header.
 */
export function stackScreenOptions({
  colors,
}: Pick<Theme, 'colors'>): NativeStackNavigationOptions {
  return {
    headerShown: true,
    // Transparent: the screen's own background (canvas and glow) runs under the bar, as in Settings;
    // `AppScreen` pads the content by the header's height.
    headerTransparent: true,
    headerBlurEffect: 'none',
    headerShadowVisible: false,
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
