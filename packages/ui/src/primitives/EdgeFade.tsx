import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../theme/theme';

interface EdgeFadeProps {
  /** Which edge the canvas is solid at. */
  edge?: 'top' | 'bottom';
  height: number;
  testID?: string;
}

/**
 * A canvas-to-clear fade laid over scrolling content, so floating chrome (the Agent header) reads
 * against what scrolls under it. Never takes touches.
 */
export function EdgeFade({ edge = 'top', height, testID = 'edge-fade' }: EdgeFadeProps) {
  const theme = useTheme();
  const solid = edge === 'top' ? 0 : 1;
  return (
    <View
      pointerEvents="none"
      style={[styles.fade, edge === 'top' ? styles.top : styles.bottom, { height }]}
      testID={testID}
    >
      <Svg width="100%" height={height}>
        <Defs>
          <LinearGradient id="edgeFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset={solid} stopColor={theme.colors.canvas} stopOpacity={0.96} />
            <Stop offset={1 - solid} stopColor={theme.colors.canvas} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height={height} fill="url(#edgeFade)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fade: { position: 'absolute', left: 0, right: 0 },
  top: { top: 0 },
  bottom: { bottom: 0 },
});
