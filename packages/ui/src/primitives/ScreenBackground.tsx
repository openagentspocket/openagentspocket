import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../theme/theme';

/**
 * Swift's `ScreenBackground`: the canvas with a radial wash of the theme's `glow` at the top edge
 * (55% at the center fading to nothing, radius 320 pt). Sits behind every screen and sheet.
 */
export function ScreenBackground({ testID = 'screen-background' }: { testID?: string }) {
  const theme = useTheme();
  const { glowSize, glowOpacity } = theme.metrics;
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.canvas }]}
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width="100%" height={glowSize}>
        <Defs>
          <RadialGradient
            id="screenGlow"
            cx="50%"
            cy="0"
            rx="100%"
            ry={glowSize}
            fx="50%"
            fy="0"
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor={theme.colors.glow} stopOpacity={glowOpacity} />
            <Stop offset="1" stopColor={theme.colors.glow} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height={glowSize} fill="url(#screenGlow)" />
      </Svg>
    </View>
  );
}
